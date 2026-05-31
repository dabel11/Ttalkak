"""
index_pdf_direct.py
────────────────────────────────────────────────────────────
RAG 서버 없이 직접 ChromaDB에 인덱싱 (서버 불필요)
rag_prompt_engineering_100_chunks_v1.pdf → 'prompt_techniques' 컬렉션

사용법:
    python index_pdf_direct.py
    python index_pdf_direct.py --pdf /path/to/file.pdf
"""

import argparse
import sys
from pathlib import Path

# 같은 폴더의 파싱 유틸 재사용
from index_pdf_techniques import extract_full_text, parse_chunks, COLLECTION, DEFAULT_PDF

# ── 자동 디바이스 선택 (indexer.py 와 동일) ──────────────────
import sys as _sys
import torch
import chromadb
import uuid
from sentence_transformers import SentenceTransformer


def _select_device() -> str:
    if _sys.platform == "darwin":
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


BATCH_EMBED = 10   # 임베딩 배치 크기


def main():
    parser = argparse.ArgumentParser(description="PDF를 직접 ChromaDB에 인덱싱")
    parser.add_argument("--pdf",        type=Path, default=DEFAULT_PDF)
    parser.add_argument("--chroma_path", default="./chroma_db")
    parser.add_argument("--model",      default="BAAI/bge-m3")
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"❌ PDF 파일 없음: {args.pdf}")
        sys.exit(1)

    # 파싱
    print(f"📄 PDF 파싱 중: {args.pdf.name}")
    full_text = extract_full_text(args.pdf)
    chunks    = parse_chunks(full_text)
    print(f"   파싱된 청크 수: {len(chunks)}개\n")

    # 모델 로드
    device = _select_device()
    print(f"🤖 임베딩 모델 로드 중: {args.model} (device={device})")
    model  = SentenceTransformer(args.model, device=device)

    # ChromaDB 연결
    client     = chromadb.PersistentClient(path=args.chroma_path)
    collection = client.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"💾 ChromaDB 컬렉션: '{COLLECTION}'\n")

    # 배치 임베딩 + 저장
    total = 0
    for i in range(0, len(chunks), BATCH_EMBED):
        batch  = chunks[i: i + BATCH_EMBED]
        texts  = [c["text"] for c in batch]
        metas  = [{"chunk_id": c["chunk_id"], "source": c["title"],
                   "technique": c["technique"], "category": c["category"],
                   "sources": c["sources"]} for c in batch]
        ids    = [str(uuid.uuid4()) for _ in batch]

        print(f"   배치 {i // BATCH_EMBED + 1} ({len(batch)}개) 임베딩 중...")
        vectors = model.encode(texts, batch_size=BATCH_EMBED, show_progress_bar=False)
        collection.upsert(ids=ids, documents=texts,
                          embeddings=vectors.tolist(), metadatas=metas)
        total += len(batch)
        print(f"   ✓ {total}개 누적 저장")

    print(f"\n🎉 완료: 총 {total}개 → '{COLLECTION}' 컬렉션")
    print(f"   익스텐션 RAG 설정 → 컬렉션: '{COLLECTION}' 또는 'papers' 선택 가능")


if __name__ == "__main__":
    main()
