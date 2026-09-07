"""
eval/score_analysis.py
────────────────────────────────────────────────────────────
top_k 점수 임계치(min_score) 설계를 위한 측정 도구.

질문: "top5를 무조건 5개 반환하지 말고, 유효한 유사도인 것만 반영하려면
      어떤 신호(dense 코사인 vs 리랭커 확률)에 어떤 임계치를 걸어야 하나?"

측정 내용 (qa_set 기준, 리랭크 top10):
  1) 정답/오답별 점수 분포 — 두 신호 각각 평균·백분위. 분리가 잘 되는 신호 확인.
  2) 임계치 스윕 — top5에 τ 필터를 걸었을 때
       유지 Recall(정답 잔존율) / Precision(반환 중 정답 비율) /
       평균 반환 수 / 빈 결과율(전부 잘려 0개가 된 쿼리 비율)

사용법 (rag-server/ 에서 실행):
    python -m eval.score_analysis --qa qa_set_realistic.json
"""

import argparse
import json
from pathlib import Path

import numpy as np

from app.rag.retriever import Retriever


def _pct(a, q):
    return float(np.percentile(a, q)) if len(a) else float("nan")


def main():
    ap = argparse.ArgumentParser(description="점수 임계치 분석")
    ap.add_argument("--qa", default="qa_set_realistic.json")
    args = ap.parse_args()

    data = json.loads((Path(__file__).parent / args.qa).read_text(encoding="utf-8"))
    items = data["items"]
    collection = data.get("collection", "prompt_techniques")

    retriever = Retriever(use_reranker=True, use_hybrid=False)

    # 쿼리별 top10 수집: (dense, rerank_prob, is_relevant, rank)
    per_query = []
    for it in items:
        relevant = set(it["relevant"])
        results = retriever.search(query=it["query"], collection_name=collection,
                                   top_k=10, use_reranker=True)
        rows = [(r.get("score", 0.0),               # dense 코사인 (표시 점수)
                 r.get("rerank_score", 0.0),        # 리랭커 sigmoid
                 r["metadata"].get("chunk_id") in relevant)
                for r in results]
        per_query.append((rows, len(relevant)))

    # ── 1) 분포: 정답 vs 오답 (top10 전체 기준) ──
    print(f"\n평가셋 {args.qa} — 질문 {len(items)}개, 리랭크 top10 기준")
    for name, idx in (("dense 코사인", 0), ("리랭커 확률", 1)):
        rel  = np.array([row[idx] for rows, _ in per_query for row in rows if row[2]])
        irr  = np.array([row[idx] for rows, _ in per_query for row in rows if not row[2]])
        print(f"\n[{name}] 분포 (정답 n={len(rel)} / 오답 n={len(irr)})")
        print(f"  정답: 평균 {rel.mean():.3f}  p10 {_pct(rel,10):.3f}  p25 {_pct(rel,25):.3f}  p50 {_pct(rel,50):.3f}")
        print(f"  오답: 평균 {irr.mean():.3f}  p50 {_pct(irr,50):.3f}  p75 {_pct(irr,75):.3f}  p90 {_pct(irr,90):.3f}")

    # ── 2) 임계치 스윕 (top5에 필터 적용 시) ──
    grids = {
        "dense 코사인": (0, [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65]),
        "리랭커 확률":   (1, [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]),
    }
    for name, (idx, grid) in grids.items():
        print(f"\n[{name}] top5 임계치 스윕")
        print("  τ      유지Recall  Precision  평균반환  빈결과율")
        # τ=없음(현행) 기준선
        base_recall = np.mean([sum(1 for r in rows[:5] if r[2]) / n_rel
                               for rows, n_rel in per_query])
        base_prec   = np.mean([sum(1 for r in rows[:5] if r[2]) / max(len(rows[:5]), 1)
                               for rows, _ in per_query])
        print(f"  없음   {base_recall:.3f}       {base_prec:.3f}      5.0       0%   ← 현행")
        for tau in grid:
            recalls, precs, kept_counts, empty = [], [], [], 0
            for rows, n_rel in per_query:
                kept = [r for r in rows[:5] if r[idx] >= tau]
                kept_counts.append(len(kept))
                recalls.append(sum(1 for r in kept if r[2]) / n_rel)
                if kept:
                    precs.append(sum(1 for r in kept if r[2]) / len(kept))
                else:
                    empty += 1
            print(f"  {tau:.2f}   {np.mean(recalls):.3f}       "
                  f"{np.mean(precs) if precs else 0:.3f}      "
                  f"{np.mean(kept_counts):.1f}       {100*empty/len(per_query):.0f}%")


if __name__ == "__main__":
    main()
