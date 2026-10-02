"""
eval/gate_eval.py
────────────────────────────────────────────────────────────
무의미 입력 게이트 평가 — 양성/음성셋에서 '기법 게이트' vs '예시 게이트'의 AUC 비교.

CORPUS_STRATEGY §1-3: 게이트는 **임계치 무관 AUC** 로 판단하고, 목표 FPR 에서 임계치를
역산한다(임계치 튜닝을 먼저 하면 안 된다). 임베딩만 쓰므로 LLM/API 비용 0.

실행 (rag-server/): python -m eval.gate_eval
"""
import json
from pathlib import Path

from app.main import retriever


def _best(query: str, collection: str) -> float:
    try:
        r = retriever.search(query=query, collection_name=collection,
                             top_k=5, fetch_k=50, min_score=0.0)
        return max((x["score"] for x in r), default=0.0)
    except Exception:
        return -1.0


def _auc(pos: list[float], neg: list[float]) -> float:
    c = sum((1 if p > n else 0.5 if p == n else 0) for p in pos for n in neg)
    return c / (len(pos) * len(neg)) if pos and neg else 0.0


def _threshold_at_fpr(pos: list[float], neg: list[float], max_fpr: float):
    """목표 FPR 이하를 만족하는 가장 낮은 임계치와 그때의 FNR."""
    cands = sorted(set(pos + neg))
    best = None
    for t in cands:
        fpr = sum(1 for n in neg if n >= t) / len(neg)
        if fpr <= max_fpr:
            fnr = sum(1 for p in pos if p < t) / len(pos)
            best = (round(t, 3), round(fpr, 3), round(fnr, 3))
            break
    return best


def main():
    data = json.loads((Path(__file__).parent / "gate_set.json").read_text(encoding="utf-8"))
    pos, neg = data["positive"], data["negative"]
    scores = {"tech": {"pos": [], "neg": []}, "ex": {"pos": [], "neg": []}}
    for label, qs in [("pos", pos), ("neg", neg)]:
        for q in qs:
            scores["tech"][label].append(_best(q, "prompt_techniques"))
            scores["ex"][label].append(_best(q, "prompt_examples"))
    print(f"양성 {len(pos)} · 음성 {len(neg)}")
    for key, name in [("tech", "기법 게이트"), ("ex", "예시 게이트")]:
        auc = _auc(scores[key]["pos"], scores[key]["neg"])
        thr = _threshold_at_fpr(scores[key]["pos"], scores[key]["neg"], 0.05)
        print(f"  {name}: AUC={auc:.3f} · FPR≤5% 임계치={thr}")


if __name__ == "__main__":
    main()
