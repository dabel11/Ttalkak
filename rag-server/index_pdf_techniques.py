"""
index_pdf_techniques.py
────────────────────────────────────────────────────────────
rag_prompt_engineering_100_chunks_v1.pdf 를 파싱해
'prompt_techniques' 컬렉션으로 인덱싱하는 스크립트.

사용법:
    python index_pdf_techniques.py
    python index_pdf_techniques.py --pdf /path/to/other.pdf
    python index_pdf_techniques.py --server http://localhost:8000
"""

import argparse
import re
import sys
from pathlib import Path

import requests
import pypdf

# ── 설정 ─────────────────────────────────────────────────────
DEFAULT_PDF    = Path(__file__).parent / "data" / "rag_prompt_engineering_100_chunks_v1.pdf"
COLLECTION     = "prompt_techniques"   # papers 와 별도 컬렉션
BATCH_SIZE     = 10
SERVER         = "http://localhost:8000"


# ── PDF 전체 텍스트 추출 ──────────────────────────────────────
def extract_full_text(pdf_path: Path) -> str:
    reader = pypdf.PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        # "Page N" 헤더 제거
        text = re.sub(r"^Page \d+\s*\n?", "", text.strip())
        pages.append(text)
    return "\n\n".join(pages)


# ── 청크 파싱 ────────────────────────────────────────────────
def parse_chunks(full_text: str) -> list[dict]:
    """
    'Chunk NNN. Title' 패턴을 기준으로 분리.
    각 청크에서 Technique / Category / Definition / Use When /
    Avoid When / Prompt Template / Project Usage Example / Sources 추출.
    """
    # 청크 경계: "Chunk NNN." 으로 시작하는 패턴
    pattern = re.compile(r"(?=Chunk\s+(\d{3})\.\s+(.+?)(?=\nTechnique:|\nChunk\s+\d{3}\.|$))", re.DOTALL)
    chunk_starts = [(m.start(), m.group(1), m.group(2).strip())
                    for m in re.finditer(r"Chunk\s+(\d{3})\.\s+(.+)", full_text)]

    chunks = []
    for i, (start, num, title) in enumerate(chunk_starts):
        end = chunk_starts[i + 1][0] if i + 1 < len(chunk_starts) else len(full_text)
        body = full_text[start:end].strip()

        # 각 필드 추출 (없으면 빈 문자열)
        def field(key: str) -> str:
            m = re.search(rf"{re.escape(key)}:\s*(.+?)(?=\n[A-Z][a-zA-Z /]+:|$)", body, re.DOTALL)
            return m.group(1).strip() if m else ""

        technique   = field("Technique")
        category    = field("Category")
        definition  = field("Definition")
        use_when    = field("Use When")
        avoid_when  = field("Avoid When")
        template    = field("Prompt Template")
        example     = field("Project Usage Example")
        sources     = field("Sources")

        # 청크 본문 텍스트 (검색에 쓸 풍부한 텍스트)
        text = (
            f"[Chunk {num}] {title}\n"
            f"Technique: {technique}\n"
            f"Category: {category}\n"
            f"Definition: {definition}\n"
            f"Use When: {use_when}\n"
            f"Avoid When: {avoid_when}\n"
            f"Prompt Template:\n{template}\n"
            f"Example: {example}"
        ).strip()

        chunks.append({
            "chunk_id":  f"pdf_{num}",
            "title":     title,
            "technique": technique,
            "category":  category,
            "text":      text,
            "sources":   sources[:300] if sources else "",
        })

    return chunks


# ── 배치 전송 ─────────────────────────────────────────────────
def send_batch(server: str, chunks: list[dict]) -> int:
    texts    = [c["text"] for c in chunks]
    metadata = [
        {
            "chunk_id":  c["chunk_id"],
            "source":    c["title"],
            "technique": c["technique"],
            "category":  c["category"],
            "sources":   c["sources"],
        }
        for c in chunks
    ]
    payload = {"chunks": texts, "metadata": metadata, "collection_name": COLLECTION}
    resp = requests.post(f"{server}/index", json=payload, timeout=300)
    resp.raise_for_status()
    return resp.json()["indexed_count"]


# ── 메인 ─────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="PDF 기법 청크를 RAG 서버에 인덱싱")
    parser.add_argument("--pdf",    type=Path, default=DEFAULT_PDF,
                        help=f"PDF 파일 경로 (기본값: {DEFAULT_PDF})")
    parser.add_argument("--server", default=SERVER,
                        help=f"FastAPI 서버 주소 (기본값: {SERVER})")
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"❌ PDF 파일을 찾을 수 없습니다: {args.pdf}")
        sys.exit(1)

    # 서버 상태 확인
    try:
        requests.get(f"{args.server}/health", timeout=5).raise_for_status()
        print(f"✅ 서버 연결 확인: {args.server}")
    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        sys.exit(1)

    # 파싱
    print(f"\n📄 PDF 파싱 중: {args.pdf.name}")
    full_text = extract_full_text(args.pdf)
    chunks    = parse_chunks(full_text)
    print(f"   파싱된 청크 수: {len(chunks)}개")

    if not chunks:
        print("❌ 청크를 파싱하지 못했습니다. PDF 형식을 확인해주세요.")
        sys.exit(1)

    # 미리보기
    print(f"\n   [미리보기] 첫 번째 청크:")
    print(f"   ID: {chunks[0]['chunk_id']}")
    print(f"   Title: {chunks[0]['title']}")
    print(f"   Category: {chunks[0]['category']}")
    print(f"   Text (앞 200자): {chunks[0]['text'][:200]}...\n")

    # 배치 인덱싱
    print(f"🔄 '{COLLECTION}' 컬렉션에 인덱싱 중...")
    total = 0
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i: i + BATCH_SIZE]
        try:
            count = send_batch(args.server, batch)
            total += count
            print(f"   배치 {i // BATCH_SIZE + 1}: {count}개 저장 완료")
        except Exception as e:
            print(f"   ❌ 배치 {i // BATCH_SIZE + 1} 오류: {e}")

    print(f"\n🎉 완료: 총 {total}개 청크 → '{COLLECTION}' 컬렉션")
    print(f"   익스텐션 RAG 설정에서 컬렉션 이름을 '{COLLECTION}'으로 변경하세요.")


if __name__ == "__main__":
    main()
