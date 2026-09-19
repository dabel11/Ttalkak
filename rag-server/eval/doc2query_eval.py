"""
eval/doc2query_eval.py
────────────────────────────────────────────────────────────
문서측 요청 예문(doc2query) A/B — `ingestion/request_views.json` 의 요청 예문을
검색뷰 벡터로 **메모리에서만** 붙였을 때 검색·관련성 판별이 어떻게 바뀌는가.

DB(`rag_chunk.embedding_views`)는 읽기만 한다. 같은 DB 를 쓰는 로컬 서버·다른 측정에
영향을 주지 않기 위해서다. 적용(백필)은 이 결과를 보고 별도로 결정한다.

비교 조건 (둘 다 운영 검색기 설정: 층 필터 ON · fetch_k 50)
  base : 본문 벡터 ∪ 축약뷰 (현행 운영)
  +req : base ∪ 요청 예문 벡터

측정
  ① 검색 — qa_set_realistic(사람 라벨, 1차 판단) / qa_set_coverage(LLM 생성, 참고)
     dense 단독 · +rerank. Hit@1 · R@5 · NDCG@5
  ② 관련성 판별 — 운영 분포 요청(gen_set 18) vs 무관 입력(WORKLOG 에 기록된 7개)
     top1 dense 점수의 AUC, min_score 0.40 기준 정상 차단(404 위험)·무관 통과 수
     ⚠️ 무관 7개는 음성셋(100건 목표, CORPUS_STRATEGY §2)이 아니다 — 방향 확인용.
  ③ 오염 점검 — 평가 질의와 정답 카드의 요청 예문 사이 최대 코사인.
     커버리지셋도 카드→요청 LLM 생성이라 예문과 거의 같은 문장이면 점수가 부푼다.

사용법 (rag-server/ 에서):
    python -m eval.doc2query_eval
"""

import json
import statistics
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.rag.retriever import Retriever  # noqa: E402
from eval.run_eval import _first_relevant_rank, _ndcg_at_k, _recall_at_k  # noqa: E402

EVAL_DIR = Path(__file__).parent
VIEWS_PATH = EVAL_DIR.parent / "ingestion" / "request_views.json"
COLLECTION = "prompt_techniques"

# WORKLOG 2026-08-09 측정 3 · 2026-07-05 에 기록된 무관 입력
NEGATIVES = ["https://example.com", "1+1은?", "오늘 날씨 어때?", "ㅋㅋㅋㅋㅋ",
             "안녕하세요", "ㅁㄴㅇㄹ asdf", "오늘 점심 뭐 먹지"]
MIN_SCORE = 0.40


class InjectedRetriever(Retriever):
    """`_load_collection` 결과에 요청 예문 벡터를 덧붙인다(메모리 한정)."""

    def __init__(self, extra: dict[str, list], **kw):
        super().__init__(**kw)
        self.extra = extra
        self.inject = False

    def _load_collection(self, collection_name: str) -> list[dict]:
        rows = super()._load_collection(collection_name)
        if not self.inject or collection_name != COLLECTION:
            return rows
        out = []
        for r in rows:
            add = self.extra.get((r["metadata"] or {}).get("chunk_id"))
            if add:
                r = dict(r)
                r["embedding_views"] = list(r.get("embedding_views") or []) + add
            out.append(r)
        return out


def retrieval(items, retriever, rerank: bool) -> dict:
    agg = {"hit1": 0.0, "r5": 0.0, "ndcg5": 0.0}
    for it in items:
        rel = set(it["relevant"])
        res = retriever.search(query=it["query"], collection_name=COLLECTION,
                               top_k=10, use_reranker=rerank)
        ids = [r["metadata"].get("chunk_id") for r in res]
        agg["hit1"] += 1.0 if _first_relevant_rank(ids, rel) == 1 else 0.0
        agg["r5"] += _recall_at_k(ids, rel, 5)
        agg["ndcg5"] += _ndcg_at_k(ids, rel, 5)
    return {k: v / len(items) for k, v in agg.items()}


def top1_dense(retriever, queries: list[str]) -> list[float]:
    rows = retriever._load_collection(COLLECTION)
    return [float(retriever._dense_scores(q, rows).max()) for q in queries]


def auc(pos: list[float], neg: list[float]) -> float:
    """Mann-Whitney U / (|pos|·|neg|) — 정상이 무관보다 높을 확률(동점 0.5)."""
    wins = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def contamination(items, extra_text, model) -> list[float]:
    """질의 ↔ 정답 카드 요청 예문의 최대 코사인(질의별)."""
    out = []
    for it in items:
        texts = [t for cid in it["relevant"] for t in extra_text.get(cid, [])]
        if not texts:
            continue
        v = model.encode([it["query"]] + texts, normalize_embeddings=True)
        out.append(float((v[1:] @ v[0]).max()))
    return out


def main() -> None:
    store = json.loads(VIEWS_PATH.read_text(encoding="utf-8"))
    extra_text = {cid: [r["q"] for r in v["requests"]] for cid, v in store["views"].items()}
    n_req = sum(len(v) for v in extra_text.values())
    print(f"요청 예문: {len(extra_text)}장 · {n_req}개 ({store['generatedBy']['model']})")

    retriever = InjectedRetriever({}, use_reranker=True, use_hybrid=False, fetch_k=50)
    flat = [(cid, t) for cid, ts in extra_text.items() for t in ts]
    vecs = retriever.model.encode([t for _, t in flat], batch_size=32).tolist()
    for (cid, _), v in zip(flat, vecs):
        retriever.extra.setdefault(cid, []).append(v)

    sets = {name: json.loads((EVAL_DIR / f"{name}.json").read_text(encoding="utf-8"))["items"]
            for name in ("qa_set_realistic", "qa_set_coverage")}
    gen_set = json.loads((EVAL_DIR / "gen_set.json").read_text(encoding="utf-8"))
    positives = [it["query"] for it in gen_set.get("items", gen_set)]

    results = {}
    for cond in ("base", "+req"):
        retriever.inject = cond == "+req"
        r = {}
        for name, items in sets.items():
            for rerank in (False, True):
                r[(name, rerank)] = retrieval(items, retriever, rerank)
        pos, neg = top1_dense(retriever, positives), top1_dense(retriever, NEGATIVES)
        r["gate"] = {"auc": auc(pos, neg),
                     "pos_min": min(pos), "neg_max": max(neg),
                     "pos_blocked": sum(p < MIN_SCORE for p in pos),
                     "neg_passed": sum(n >= MIN_SCORE for n in neg)}
        results[cond] = r

    print("\n① 검색 (n: realistic 59 · coverage 57)")
    print(f"{'셋':<18}{'rerank':<8}{'지표':<7}{'base':>8}{'+req':>8}{'Δ':>8}")
    for name in sets:
        for rerank in (False, True):
            for m in ("hit1", "r5", "ndcg5"):
                b, a = results["base"][(name, rerank)][m], results["+req"][(name, rerank)][m]
                print(f"{name:<18}{('on' if rerank else 'off'):<8}{m:<7}{b:>8.3f}{a:>8.3f}{a - b:>+8.3f}")

    print(f"\n② 관련성 판별 (정상 gen_set {len(positives)} vs 무관 {len(NEGATIVES)}, top1 dense)")
    for cond in ("base", "+req"):
        g = results[cond]["gate"]
        print(f"  {cond:<5} AUC {g['auc']:.3f} · 정상 최저 {g['pos_min']:.3f} · 무관 최고 {g['neg_max']:.3f}"
              f" · τ={MIN_SCORE}: 정상 차단 {g['pos_blocked']}/{len(positives)}"
              f" · 무관 통과 {g['neg_passed']}/{len(NEGATIVES)}")

    print("\n③ 오염 점검 — 질의 ↔ 정답 카드 요청 예문 최대 코사인")
    for name, items in sets.items():
        c = contamination(items, extra_text, retriever.model)
        print(f"  {name:<18} 중앙값 {statistics.median(c):.3f} · ≥0.85 {sum(x >= 0.85 for x in c)}/{len(c)}"
              f" · ≥0.75 {sum(x >= 0.75 for x in c)}/{len(c)}")


if __name__ == "__main__":
    main()
