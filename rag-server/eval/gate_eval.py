"""
eval/gate_eval.py
────────────────────────────────────────────────────────────
무의미 입력 게이트 평가 — 양성/음성셋에서 '기법 게이트' vs '예시 게이트'의 AUC 비교.

CORPUS_STRATEGY §1-3: 게이트는 **임계치 무관 AUC** 로 판단하고, 목표 FPR 에서 임계치를
역산한다(임계치 튜닝을 먼저 하면 안 된다). 임베딩만 쓰므로 LLM/API 비용 0.

2026-11-25: gate_set.json 의 확장 셋(positive_extended 분야별 · negative_extended)까지 쓰고,
AUC 만으로는 안 보이던 **구멍**(현재 임계치에 막히는 정상 요청)을 분야별로 출력한다.
계기 — "크롤링 프로그램 작성해줘"가 예시 코퍼스에 코드 작성 유형이 없어 404 였는데,
원본 24건 AUC 는 1.000 이라 드러나지 않았다.

실행 (rag-server/):
    python -m eval.gate_eval                     # 임계치 = RAG_GATE_MIN_SCORE(기본 0.53)
    python -m eval.gate_eval --threshold 0.50    # 다른 임계치로 막힘 목록 보기
"""
import argparse
import json
import os
from pathlib import Path

ORIGINAL_DOMAIN = "원본"
SET_PATH = Path(__file__).parent / "gate_set.json"


def load_gate_set(data: dict) -> tuple[list[tuple[str, str]], list[str]]:
    """gate_set.json → ([(분야, 양성 요청)], [음성 입력]).

    원본 'positive' 는 분야 '원본'으로, 'positive_extended' 는 분야별로 붙인다.
    중복은 처음 나온 것만 남긴다(같은 요청을 두 번 세면 AUC·FNR 이 왜곡된다)."""
    pos: list[tuple[str, str]] = []
    seen: set[str] = set()
    groups = [(ORIGINAL_DOMAIN, data.get("positive", []))]
    groups += list((data.get("positive_extended") or {}).items())
    for domain, qs in groups:
        for q in qs:
            if q not in seen:
                seen.add(q)
                pos.append((domain, q))
    neg: list[str] = []
    for q in list(data.get("negative", [])) + list(data.get("negative_extended", [])):
        if q not in neg:
            neg.append(q)
    return pos, neg


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


def blocked_report(pos_scored: list[tuple[str, str, float]],
                   neg_scored: list[tuple[str, float]],
                   threshold: float) -> dict:
    """임계치에서 막히는 양성(오차단)·통과하는 음성(오통과)과 분야별 요약.

    게이트는 `점수 < 임계치` 면 404 다(app/core/gate.py) — 같은 부등호를 쓴다."""
    blocked = sorted([(d, q, s) for d, q, s in pos_scored if s < threshold], key=lambda x: x[2])
    leaked = sorted([(q, s) for q, s in neg_scored if s >= threshold], key=lambda x: -x[1])
    by_domain: dict[str, dict] = {}
    for d, _q, s in pos_scored:
        b = by_domain.setdefault(d, {"n": 0, "blocked": 0, "min": None})
        b["n"] += 1
        b["blocked"] += 1 if s < threshold else 0
        b["min"] = s if b["min"] is None else min(b["min"], s)
    return {"blocked": blocked, "leaked": leaked, "by_domain": by_domain}


def _best(retriever, query: str, collection: str, **kw) -> float:
    try:
        r = retriever.search(query=query, collection_name=collection,
                             top_k=5, fetch_k=50, min_score=0.0, **kw)
        return max((x["score"] for x in r), default=0.0)
    except Exception:
        return -1.0


def main():
    ap = argparse.ArgumentParser(description="무의미 입력 게이트 평가")
    ap.add_argument("--threshold", type=float,
                    default=float(os.environ.get("RAG_GATE_MIN_SCORE", "0.53")),
                    help="막힘 목록을 볼 임계치(기본 RAG_GATE_MIN_SCORE 또는 0.53)")
    args = ap.parse_args()

    # 임베딩 모델·DB 는 여기서만 불러온다 — 모듈 import 만으로는 무거운 의존을 끌지 않게(테스트용).
    from app.main import retriever

    pos, neg = load_gate_set(json.loads(SET_PATH.read_text(encoding="utf-8")))
    scores = {"tech": {"pos": [], "neg": []}, "ex": {"pos": [], "neg": []}}
    # 예시 게이트는 운영(app/main.py retrieve_contexts)과 같은 경로 — 리랭크·하이브리드 없이 dense 최고점.
    # 종전엔 리랭크 top5 안의 최고점이라 운영보다 낮게 나왔고, 리랭커(Jina/torch)에 따라 값이 흔들렸다.
    ex_path = {"use_reranker": False, "use_hybrid": False}
    for _d, q in pos:
        scores["tech"]["pos"].append(_best(retriever, q, "prompt_techniques"))
        scores["ex"]["pos"].append(_best(retriever, q, "prompt_examples", **ex_path))
    for q in neg:
        scores["tech"]["neg"].append(_best(retriever, q, "prompt_techniques"))
        scores["ex"]["neg"].append(_best(retriever, q, "prompt_examples", **ex_path))

    print(f"양성 {len(pos)} · 음성 {len(neg)}")
    for key, name in [("tech", "기법 게이트"), ("ex", "예시 게이트")]:
        auc = _auc(scores[key]["pos"], scores[key]["neg"])
        thr = _threshold_at_fpr(scores[key]["pos"], scores[key]["neg"], 0.05)
        print(f"  {name}: AUC={auc:.3f} · FPR≤5% 임계치={thr}")

    # 운영 게이트는 예시 코퍼스 기준 — 그 점수로 구멍을 본다.
    pos_scored = [(d, q, s) for (d, q), s in zip(pos, scores["ex"]["pos"])]
    neg_scored = list(zip(neg, scores["ex"]["neg"]))
    rep = blocked_report(pos_scored, neg_scored, args.threshold)

    print(f"\n[예시 게이트 · 임계치 {args.threshold}] 분야별")
    for d, b in rep["by_domain"].items():
        print(f"  {d:12s} {b['n']:3d}건 · 막힘 {b['blocked']:2d} · 최저 {b['min']:.3f}")
    print(f"\n막히는 정상 요청 {len(rep['blocked'])}건 (낮은 순) — 이 분야의 예시를 보강할 것")
    for d, q, s in rep["blocked"]:
        print(f"  {s:.3f}  [{d}] {q}")
    print(f"\n통과하는 무의미 입력 {len(rep['leaked'])}건 (높은 순)")
    for q, s in rep["leaked"]:
        print(f"  {s:.3f}  {q}")


if __name__ == "__main__":
    main()
