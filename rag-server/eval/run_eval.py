"""
eval/run_eval.py
────────────────────────────────────────────────────────────
검색 품질 평가. qa_set.json(질문 + 정답 chunk_id)을 Retriever로 검색해
Recall@5 / MRR@10 / Hit@1 을 계산한다. 개선 전후 비교용.

사용법:
    python eval/run_eval.py                      # dense 기준선
    python eval/run_eval.py --rerank             # 리랭커 적용 (작업1 이후)
    python eval/run_eval.py --query-transform    # 쿼리 변환 적용 (작업2 이후)
    python eval/run_eval.py --rerank --query-transform   # 둘 다
    python eval/run_eval.py --show-fails         # 실패 케이스 출력
"""

import argparse
import json
import sys
from pathlib import Path

# rag-server 루트를 import 경로에 추가 (eval/ 하위에서 실행해도 동작)
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from retriever import Retriever  # noqa: E402

K_RETRIEVE = 10   # 검색해 올 후보 수 (MRR@10 기준)
K_RECALL   = 5    # Recall 컷오프


def _ranks_of_relevant(retrieved_ids: list[str], relevant: set[str]) -> list[int]:
    """retrieved_ids에서 relevant에 속하는 항목들의 1-based 순위 목록."""
    return [i + 1 for i, cid in enumerate(retrieved_ids) if cid in relevant]


def evaluate(items, retriever, collection, use_rerank, use_hybrid, qmode, show_fails):
    # qmode: None / "qt"(키워드 변환) / "hyde"(가상문서)
    transform = None
    if qmode == "qt":
        from query_transform import transform
    elif qmode == "hyde":
        from query_transform import hyde as transform

    recall_hits = mrr_sum = hit1 = 0
    fails = []

    for it in items:
        query    = it["query"]
        relevant = set(it["relevant"])

        search_q = transform(query) if transform else query

        results = retriever.search(
            query=search_q, collection_name=collection, top_k=K_RETRIEVE,
            use_reranker=use_rerank, use_hybrid=use_hybrid,
        )

        retrieved_ids = [r["metadata"].get("chunk_id") for r in results]
        ranks = _ranks_of_relevant(retrieved_ids, relevant)

        if ranks and ranks[0] == 1:
            hit1 += 1
        if any(r <= K_RECALL for r in ranks):
            recall_hits += 1
        mrr_sum += (1.0 / ranks[0]) if ranks else 0.0

        if show_fails and not any(r <= K_RECALL for r in ranks):
            fails.append((query, sorted(relevant), retrieved_ids[:K_RECALL]))

    n = len(items)
    print(f"\n변형: hybrid={use_hybrid}  rerank={use_rerank}  query={qmode or 'raw'}  (질문 {n}개)")
    print("─" * 48)
    print(f"  Hit@1       : {hit1/n:.3f}  ({hit1}/{n})")
    print(f"  Recall@{K_RECALL}    : {recall_hits/n:.3f}  ({recall_hits}/{n})")
    print(f"  MRR@{K_RETRIEVE}      : {mrr_sum/n:.3f}")
    print("─" * 48)

    if fails:
        print(f"\n실패 케이스 ({len(fails)}건):")
        for q, rel, got in fails:
            print(f"  Q: {q}")
            print(f"     정답={rel}  검색={got}")


def main():
    ap = argparse.ArgumentParser(description="RAG 검색 품질 평가")
    ap.add_argument("--rerank", action="store_true", help="리랭커 적용")
    ap.add_argument("--hybrid", action="store_true", help="dense+BM25 하이브리드 적용")
    ap.add_argument("--query-transform", action="store_true", help="키워드 쿼리 변환 적용")
    ap.add_argument("--hyde", action="store_true", help="HyDE 가상문서 쿼리 적용")
    ap.add_argument("--show-fails", action="store_true", help="실패 케이스 출력")
    ap.add_argument("--qa", default="qa_set.json", help="평가셋 파일명 (eval/ 기준)")
    ap.add_argument("--all", action="store_true",
                    help="dense / +hybrid / +rerank / +both 4개 변형을 한 번에 비교")
    args = ap.parse_args()
    qmode = "hyde" if args.hyde else ("qt" if args.query_transform else None)

    qa_path = Path(__file__).parent / args.qa
    data = json.loads(qa_path.read_text(encoding="utf-8"))
    items = data["items"]
    collection = data.get("collection", "prompt_techniques")
    print(f"평가셋: {args.qa}  (컬렉션 {collection})")

    retriever = Retriever()  # 모델 1회 로드 후 변형 간 공유

    if args.all:
        # (hybrid, rerank) 조합 — 쿼리 모드는 raw로 고정 비교
        for hy, rr in [(False, False), (True, False), (False, True), (True, True)]:
            evaluate(items, retriever, collection, rr, hy, None, args.show_fails)
    else:
        evaluate(items, retriever, collection, args.rerank,
                 args.hybrid, qmode, args.show_fails)


if __name__ == "__main__":
    main()
