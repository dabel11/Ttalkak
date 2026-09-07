"""
index_pdf_direct.py
────────────────────────────────────────────────────────────
프롬프트 기법 PDF를 파싱해 MySQL(rag_chunk)에 직접 인덱싱한다.
(RAG 서버 기동 불필요 — Indexer를 직접 사용)

기본 대상: data/rag_prompt_engineering_100_chunks_v1.pdf → 'prompt_techniques'
DB 접속 정보는 db.py가 .env/환경변수에서 읽는다.

사용법 (rag-server/ 에서 실행):
    python -m ingestion.pdf_indexer
    python -m ingestion.pdf_indexer --pdf /path/to/file.pdf
"""

import argparse
import re
import sys
from pathlib import Path

import pypdf

from app import DATA_DIR
from app.rag.indexer import Indexer

DEFAULT_PDF = DATA_DIR / "rag_prompt_engineering_100_chunks_v1.pdf"
COLLECTION  = "prompt_techniques"


# ── PDF 전체 텍스트 추출 ──────────────────────────────────────
def extract_full_text(pdf_path: Path) -> str:
    reader = pypdf.PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        text = re.sub(r"^Page \d+\s*\n?", "", text.strip())  # "Page N" 헤더 제거
        pages.append(text)
    return "\n\n".join(pages)


# ── 청크 파싱 ────────────────────────────────────────────────
def parse_chunks(full_text: str) -> list[dict]:
    """
    'Chunk NNN. Title' 패턴으로 분리하고 각 청크에서
    Technique/Category/Definition/Use When/Avoid When/Prompt Template/
    Project Usage Example/Sources 필드를 추출한다.
    """
    chunk_starts = [(m.start(), m.group(1), m.group(2).strip())
                    for m in re.finditer(r"Chunk\s+(\d{3})\.\s+(.+)", full_text)]

    chunks = []
    for i, (start, num, title) in enumerate(chunk_starts):
        end  = chunk_starts[i + 1][0] if i + 1 < len(chunk_starts) else len(full_text)
        body = full_text[start:end].strip()

        def field(key: str) -> str:
            m = re.search(rf"{re.escape(key)}:\s*(.+?)(?=\n[A-Z][a-zA-Z /]+:|$)", body, re.DOTALL)
            return m.group(1).strip() if m else ""

        technique  = field("Technique")
        category   = field("Category")
        definition = field("Definition")
        use_when   = field("Use When")
        avoid_when = field("Avoid When")
        template   = field("Prompt Template")
        example    = field("Project Usage Example")
        sources    = field("Sources")

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


# ── 메인 ─────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="프롬프트 기법 PDF를 MySQL에 직접 인덱싱")
    parser.add_argument("--pdf",   type=Path, default=DEFAULT_PDF)
    parser.add_argument("--model", default="BAAI/bge-m3")
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"❌ PDF 파일 없음: {args.pdf}")
        sys.exit(1)

    print(f"📄 PDF 파싱 중: {args.pdf.name}")
    full_text = extract_full_text(args.pdf)
    chunks    = parse_chunks(full_text)
    print(f"   파싱된 청크 수: {len(chunks)}개\n")

    if not chunks:
        print("❌ 청크를 파싱하지 못했습니다. PDF 형식을 확인해주세요.")
        sys.exit(1)

    texts = [c["text"] for c in chunks]
    metas = [{"chunk_id": c["chunk_id"], "source": c["title"],
              "technique": c["technique"], "category": c["category"],
              "sources": c["sources"]} for c in chunks]

    indexer = Indexer(model_name=args.model)
    total = indexer.index(chunks=texts, metadata=metas, collection_name=COLLECTION)

    print(f"\n🎉 완료: 총 {total}개 → '{COLLECTION}' 컬렉션 (MySQL)")


if __name__ == "__main__":
    main()
