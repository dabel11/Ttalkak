"""
ingestion/reembed.py
────────────────────────────────────────────────────────────
rag_chunk 의 **임베딩 벡터를 현재 백엔드로 재계산**한다(본문 `embedding` +
검색뷰 `embedding_views`). `document`·`metadata`·`chunk_id` 는 읽기만 하고 안 바꾼다.

언제 쓰나: 임베딩 백엔드/모델/차원을 바꿨을 때. 예) bge-m3(로컬, 1024d) 로 적재된
코퍼스를 Gemini(gemini-embedding-001, 768d)로 전환 → 저장된 벡터가 새 쿼리 임베딩과
공간이 달라 검색이 깨진다. 이 스크립트로 모든 행을 **같은 새 백엔드로 다시 임베딩**해
공간을 맞춘다.

전제: .env 에 전환 후 설정을 넣고 돌린다(예 EMBEDDING_BACKEND=gemini + GEMINI_API_KEY).
      문서는 RETRIEVAL_DOCUMENT task_type 으로 임베딩된다(embed_documents 경유).

사용법 (rag-server/ 에서):
    python -m ingestion.reembed                      # 모든 컬렉션
    python -m ingestion.reembed --collection prompt_techniques
    python -m ingestion.reembed --dry-run            # 대상 건수만
    python -m ingestion.reembed --batch 50           # 커밋/임베딩 배치 크기

멱등: 여러 번 돌려도 같은 결과(현재 백엔드로 덮어쓸 뿐). 중단 시 재실행하면 이어서
덮어쓴다(이미 새 벡터인 행도 무해하게 재계산).
"""

import argparse

from sqlalchemy import select

from app.core.db import SessionLocal, RagChunk, init_db
from app.core.embeddings import backend, embed_documents
from app.rag.views import build_search_views


def _collections(session, only: str | None) -> list[str]:
    if only:
        return [only]
    names = session.scalars(
        select(RagChunk.collection_name).distinct().order_by(RagChunk.collection_name)
    ).all()
    return list(names)


def _reembed_collection(session, collection: str, batch: int, dry_run: bool) -> int:
    rows = session.scalars(
        select(RagChunk).where(RagChunk.collection_name == collection).order_by(RagChunk.id)
    ).all()
    if not rows:
        print(f"  '{collection}': 행 없음 — 건너뜀")
        return 0

    print(f"  '{collection}': {len(rows)}행 재임베딩 대상")
    if dry_run:
        return 0

    done = 0
    for start in range(0, len(rows), batch):
        chunk_rows = rows[start:start + batch]
        docs = [r.document for r in chunk_rows]
        per_row_views = [build_search_views(r.document, collection) for r in chunk_rows]
        flat_views = [v for vs in per_row_views for v in vs]

        # 본문 벡터 + 뷰 벡터를 현재 백엔드로 임베딩(gemini=RETRIEVAL_DOCUMENT API 호출)
        body_vecs = embed_documents(docs)
        view_vecs = embed_documents(flat_views) if flat_views else []

        cursor = 0
        for row, body_vec, views in zip(chunk_rows, body_vecs, per_row_views):
            row.embedding = body_vec
            row.embedding_views = view_vecs[cursor:cursor + len(views)] or None
            cursor += len(views)
        session.commit()

        done += len(chunk_rows)
        print(f"    …{done}/{len(rows)}")
    return done


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", default=None, help="특정 컬렉션만(미지정=전체)")
    ap.add_argument("--batch", type=int, default=50, help="임베딩/커밋 배치 크기")
    ap.add_argument("--dry-run", action="store_true", help="대상 건수만 출력")
    args = ap.parse_args()

    init_db()
    print(f"재임베딩 백엔드: {backend()}")

    total = 0
    with SessionLocal() as session:
        for coll in _collections(session, args.collection):
            total += _reembed_collection(session, coll, args.batch, args.dry_run)

    if args.dry_run:
        print("dry-run — 저장 안 함")
    else:
        print(f"완료: {total}행 재임베딩(본문 + 검색뷰)")


if __name__ == "__main__":
    main()
