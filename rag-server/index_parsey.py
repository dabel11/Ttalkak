"""
index_papers.py
논문 청킹 결과(chunks.json)를 읽어 FastAPI /index 엔드포인트로 전송

사용법:
    # 단일 파일
    python index_parsey.py --file data/2503_02400v2/chunks.json

    # 폴더 안의 모든 chunks.json 일괄 처리
    python index_parsey.py --dir data/

    # FastAPI 서버 주소 지정 (기본값: localhost:8000)
    python index_parsey.py --dir data/ --server http://localhost:8000
"""

import argparse
import json
import sys
from pathlib import Path

import requests

# ──────────────────────────────────────────
# 설정
# ──────────────────────────────────────────

COLLECTION_NAME = "papers"
BATCH_SIZE      = 10   # BGE-M3 모델의 메모리 한계로 10개씩 처리

# reference 청크는 본문 내용이 없어서 검색에 도움이 안 됨 → 제외
SKIP_CHUNK_TYPES = {"reference"}


# ──────────────────────────────────────────
# 핵심 함수
# ──────────────────────────────────────────

def load_chunks(filepath: Path) -> list[dict]:
    """chunks.json 파일 하나를 읽어 청크 리스트 반환"""
    with open(filepath, encoding="utf-8") as f:
        chunks = json.load(f)
    # reference 타입 제외
    return [c for c in chunks if c.get("chunk_type") not in SKIP_CHUNK_TYPES]


def send_batch(server: str, chunks: list[dict]) -> int:
    """
    청크 리스트를 FastAPI /index 엔드포인트로 전송
    반환값: 실제로 저장된 청크 수
    """
    texts    = [c["text"] for c in chunks]
    metadata = [
        {
            "chunk_id"    : c["chunk_id"],
            "paper_id"    : c["paper_id"],
            "source"      : c["paper_title"],   # retriever가 출처로 표시
            "section"     : c.get("section_name", ""),
            "chunk_type"  : c.get("chunk_type", ""),
            "chunk_index" : c.get("chunk_index", 0),
            "has_formula" : str(c.get("has_formula", False)),
            "has_table"   : str(c.get("has_table", False)),
        }
        for c in chunks
    ]

    payload = {
        "chunks"         : texts,
        "metadata"       : metadata,
        "collection_name": COLLECTION_NAME,
    }

    resp = requests.post(f"{server}/index", json=payload, timeout=300)
    resp.raise_for_status()
    return resp.json()["indexed_count"]


def index_file(filepath: Path, server: str) -> int:
    """chunks.json 파일 한 개를 배치 단위로 인덱싱"""
    chunks = load_chunks(filepath)
    if not chunks:
        print(f"  [SKIP] 청크 없음: {filepath.name}")
        return 0

    paper_title = chunks[0].get("paper_title", filepath.parent.name)
    print(f"\n📄 {paper_title}")
    print(f"   청크 수: {len(chunks)}개 → {COLLECTION_NAME} 컬렉션에 저장 중...")

    total = 0
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        count = send_batch(server, batch)
        total += count
        print(f"   배치 {i // BATCH_SIZE + 1}: {count}개 저장 완료")

    print(f"   ✓ 총 {total}개 저장됨")
    return total


# ──────────────────────────────────────────
# 진입점
# ──────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="논문 청크를 RAG 서버에 인덱싱")
    group  = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", type=Path, help="단일 chunks.json 경로")
    group.add_argument("--dir",  type=Path, help="chunks.json 파일들이 있는 폴더 경로")
    parser.add_argument(
        "--server", default="http://localhost:8000",
        help="FastAPI 서버 주소 (기본값: http://localhost:8000)"
    )
    args = parser.parse_args()

    # 서버 상태 확인
    try:
        r = requests.get(f"{args.server}/health", timeout=5)
        r.raise_for_status()
        print(f"✅ 서버 연결 확인: {args.server}")
    except Exception as e:
        print(f"❌ 서버에 연결할 수 없습니다: {e}")
        print("   'python main.py' 로 FastAPI 서버를 먼저 실행해주세요.")
        sys.exit(1)

    # 처리할 파일 목록 수집
    if args.file:
        files = [args.file]
    else:
        files = sorted(args.dir.rglob("chunks.json"))
        if not files:
            print(f"❌ {args.dir} 에서 chunks.json 파일을 찾을 수 없습니다.")
            sys.exit(1)
        print(f"📂 총 {len(files)}개 chunks.json 파일 발견")

    # 인덱싱 실행
    grand_total = 0
    for filepath in files:
        try:
            grand_total += index_file(filepath, args.server)
        except Exception as e:
            print(f"  ❌ 오류 ({filepath}): {e}")

    print(f"\n🎉 인덱싱 완료: 총 {grand_total}개 청크가 ChromaDB에 저장됐습니다.")


if __name__ == "__main__":
    main()