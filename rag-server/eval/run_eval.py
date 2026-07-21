"""
eval/run_eval.py
────────────────────────────────────────────────────────────
검색 품질 평가. qa_set.json(질문 + 정답 chunk_id)을 Retriever로 검색해
랭킹 지표를 계산한다. 개선 전후 비교용.

측정 지표 (relevant 가 항목당 1~3개인 이진 관련도):
  Hit@1        — top1 이 정답인 비율
  Recall@1/3/5 — 정답 중 상위 k 안에 든 비율(정답 ∩ top_k / 정답수). ★변별력 핵심
  Precision@5  — top5 중 정답 비율(정답 ∩ top5 / 5)
  MRR@10       — 첫 정답의 역순위 평균
  NDCG@5       — 순위 가중(정답이 위에 있을수록 가점). 이진 관련도 기준

  ※ 기존 'Recall@5'는 사실 "top5에 하나라도 있으면 hit"(=Hit@5)이라 0.95+로
    천장에 닿아 변별이 안 됐다. 위 진짜 Recall@k·NDCG·Precision 으로 교체.

사용법 (rag-server/ 에서 실행):
    python -m eval.run_eval --qa qa_set_realistic.json   # 기본(dense)
    python -m eval.run_eval --rerank --qa qa_set_realistic.json
    python -m eval.run_eval --all --qa qa_set_realistic.json   # 4변형 비교
    python -m eval.run_eval --show-fails                 # 실패 케이스 출력
"""

import argparse
import json
import math
import time
from pathlib import Path

from app.rag.retriever import Retriever

K_RETRIEVE = 10   # 검색해 올 후보 수 (MRR@10 기준)


def _recall_at_k(retrieved_ids: list[str], relevant: set[str], k: int) -> float:
    """정답 중 상위 k 안에 든 비율 = |정답 ∩ top_k| / |정답|."""
    if not relevant:
        return 0.0
    found = sum(1 for cid in retrieved_ids[:k] if cid in relevant)
    return found / len(relevant)


def _precision_at_k(retrieved_ids: list[str], relevant: set[str], k: int) -> float:
    """top_k 중 정답 비율 = |정답 ∩ top_k| / k."""
    found = sum(1 for cid in retrieved_ids[:k] if cid in relevant)
    return found / k


def _ndcg_at_k(retrieved_ids: list[str], relevant: set[str], k: int) -> float:
    """이진 관련도 NDCG@k. 정답이 위쪽에 있을수록 높다."""
    dcg = sum(1.0 / math.log2(i + 2)
              for i, cid in enumerate(retrieved_ids[:k]) if cid in relevant)
    ideal = sum(1.0 / math.log2(i + 2) for i in range(min(len(relevant), k)))
    return (dcg / ideal) if ideal else 0.0


def _first_relevant_rank(retrieved_ids: list[str], relevant: set[str]) -> int | None:
    """첫 정답의 1-based 순위(없으면 None)."""
    for i, cid in enumerate(retrieved_ids):
        if cid in relevant:
            return i + 1
    return None


def evaluate(items, retriever, collection, use_rerank, use_hybrid, qmode, show_fails,
             fetch_k=None):
    # qmode: None / "qt"(키워드 변환) / "hyde"(가상문서)
    transform = None
    if qmode == "qt":
        from app.rag.query_transform import transform
    elif qmode == "hyde":
        from app.rag.query_transform import hyde as transform

    agg = {"hit1": 0.0, "r1": 0.0, "r3": 0.0, "r5": 0.0,
           "p5": 0.0, "mrr": 0.0, "ndcg5": 0.0}
    fails = []
    elapsed = 0.0

    for it in items:
        query    = it["query"]
        relevant = set(it["relevant"])

        search_q = transform(query) if transform else query

        t0 = time.perf_counter()
        results = retriever.search(
            query=search_q, collection_name=collection, top_k=K_RETRIEVE,
            use_reranker=use_rerank, use_hybrid=use_hybrid, fetch_k=fetch_k,
        )
        elapsed += time.perf_counter() - t0

        retrieved_ids = [r["metadata"].get("chunk_id") for r in results]
        first = _first_relevant_rank(retrieved_ids, relevant)

        agg["hit1"]  += 1.0 if first == 1 else 0.0
        agg["r1"]    += _recall_at_k(retrieved_ids, relevant, 1)
        agg["r3"]    += _recall_at_k(retrieved_ids, relevant, 3)
        agg["r5"]    += _recall_at_k(retrieved_ids, relevant, 5)
        agg["p5"]    += _precision_at_k(retrieved_ids, relevant, 5)
        agg["mrr"]   += (1.0 / first) if first else 0.0
        agg["ndcg5"] += _ndcg_at_k(retrieved_ids, relevant, 5)

        if show_fails and _recall_at_k(retrieved_ids, relevant, 5) == 0.0:
            fails.append((query, sorted(relevant), retrieved_ids[:5]))

    n = len(items)
    fk = fetch_k if fetch_k is not None else retriever.fetch_k
    print(f"\n변형: hybrid={use_hybrid}  rerank={use_rerank}  query={qmode or 'raw'}"
          f"  fetch_k={fk}  (질문 {n}개)")
    print("─" * 48)
    print(f"  Hit@1       : {agg['hit1']/n:.3f}")
    print(f"  Recall@1    : {agg['r1']/n:.3f}")
    print(f"  Recall@3    : {agg['r3']/n:.3f}")
    print(f"  Recall@5    : {agg['r5']/n:.3f}   (진짜 recall — 천장 아님)")
    print(f"  Precision@5 : {agg['p5']/n:.3f}")
    print(f"  MRR@{K_RETRIEVE}      : {agg['mrr']/n:.3f}")
    print(f"  NDCG@5      : {agg['ndcg5']/n:.3f}")
    print(f"  검색 지연     : 평균 {1000*elapsed/n:.0f}ms/쿼리")
    print("─" * 48)

    if fails:
        print(f"\n실패 케이스 (top5에 정답 0개, {len(fails)}건):")
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
    ap.add_argument("--fetch-k", type=int, nargs="+", default=None,
                    help="리랭크 후보 폭 스윕 (예: --fetch-k 20 15 10). 여러 값이면 순차 비교")
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
    elif args.fetch_k and len(args.fetch_k) > 1:
        # fetch_k 스윕 — 나머지 플래그는 고정
        for fk in args.fetch_k:
            evaluate(items, retriever, collection, args.rerank,
                     args.hybrid, qmode, args.show_fails, fetch_k=fk)
    else:
        fk = args.fetch_k[0] if args.fetch_k else None
        evaluate(items, retriever, collection, args.rerank,
                 args.hybrid, qmode, args.show_fails, fetch_k=fk)


if __name__ == "__main__":
    main()
