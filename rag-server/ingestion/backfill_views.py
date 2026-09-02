"""
ingestion/backfill_views.py
────────────────────────────────────────────────────────────
이미 인덱싱된 행에 **검색용 축약뷰 벡터**(`rag_chunk.embedding_views`)를 채운다.

`document`·`metadata`·본문 `embedding` 은 **읽기만** 하고 절대 바꾸지 않는다.
재인덱싱(문서 재적재)이 아니라 뷰 벡터만 덧붙이는 작업이라, 코퍼스 내용과
기존 chunk_id 는 그대로다.

사용법 (rag-server/ 에서):
    python -m ingestion.backfill_views                      # 기본 prompt_techniques
    python -m ingestion.backfill_views --collection prompt_examples
    python -m ingestion.backfill_views --dry-run            # 몇 건이 대상인지만
    python -m ingestion.backfill_views --clear              # 뷰 제거(롤백)
"""

import argparse

from sqlalchemy import select

from app.core.db import SessionLocal, RagChunk, init_db
from app.core.embeddings import get_model
from app.rag.views import build_search_views


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", default="prompt_techniques")
    ap.add_argument("--dry-run", action="store_true", help="계산만 하고 저장 안 함")
    ap.add_argument("--clear", action="store_true", help="뷰 벡터를 지운다(롤백)")
    args = ap.parse_args()

    init_db()   # embedding_views 컬럼 보장

    with SessionLocal() as session:
        rows = session.scalars(
            select(RagChunk).where(RagChunk.collection_name == args.collection)
            .order_by(RagChunk.id)
        ).all()

        if not rows:
            print(f"'{args.collection}' 에 행이 없습니다.")
            return

        if args.clear:
            for row in rows:
                row.embedding_views = None
            session.commit()
            print(f"뷰 벡터 제거 완료: {len(rows)}행 → 본문 벡터 단독(종전 동작)")
            return

        # 뷰 텍스트를 먼저 다 만들고 한 배치로 임베딩
        per_row   = [build_search_views(r.document, args.collection) for r in rows]
        flat      = [v for vs in per_row for v in vs]
        with_view = sum(1 for vs in per_row if vs)

        print(f"컬렉션 '{args.collection}': {len(rows)}행 중 뷰 생성 {with_view}행 "
              f"(뷰 텍스트 {len(flat)}개, 평균 {sum(len(v) for v in flat) // max(len(flat), 1)}자)")
        if args.dry_run:
            if flat:
                print(f"\n--- 뷰 예시 ---\n{flat[0]}")
            return
        if not flat:
            print("생성된 뷰가 없습니다 (이 컬렉션에 등록된 뷰 빌더 없음).")
            return

        vectors = get_model().encode(flat, batch_size=32, show_progress_bar=True).tolist()

        cursor = 0
        for row, views in zip(rows, per_row):
            row.embedding_views = vectors[cursor:cursor + len(views)] or None
            cursor += len(views)
        session.commit()

    print(f"저장 완료: {with_view}행에 뷰 벡터 적재 (문서·본문 벡터 무변경)")


if __name__ == "__main__":
    main()
