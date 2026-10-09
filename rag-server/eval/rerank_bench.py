"""
eval/rerank_bench.py
────────────────────────────────────────────────────────────
리랭크 백엔드 실측 — 키가 설정된 프로바이더(Cohere/Jina/Voyage)를 우리 코퍼스(gate_set 양성
쿼리)로 돌려 **평균 지연** 과 **torch(bge-reranker-v2-m3) 대비 top-5 일치** 를 잰다.
어떤 API 가 "효율적"인지(빠름 + 품질 유지)를 추측이 아니라 측정으로 답하기 위함.

실행 (rag-server/, 해당 키를 .env/환경에 넣은 뒤):
    RAG_RERANK_BACKEND=  python -m eval.rerank_bench      # 키 있는 백엔드 자동 측정
토치 기준 비교라 torch 도 함께 돈다(느림 — 1회 워밍업 후 측정).
"""
import json
import os
import time
from pathlib import Path

from app.main import retriever
from app.core import rerank

COL = "prompt_techniques"
TOPK = 5
FETCH = 50


def _torch_top5(query: str, candidates: list[dict]) -> list[str]:
    hits = retriever._rerank(query, candidates, TOPK)   # RAG_RERANK_BACKEND 영향받음
    return [h["text"] for h in hits]


def _candidates(query: str) -> list[dict]:
    rows = retriever._load_collection(COL)
    return retriever._candidates(query, rows, FETCH, False, COL)


def main():
    qs = json.loads((Path("eval/gate_set.json")).read_text(encoding="utf-8"))["positive"]

    # 1) torch 기준(강제)
    os.environ["RAG_RERANK_BACKEND"] = "torch"
    retriever._reranker = None
    base = {}
    t0 = time.time()
    for q in qs:
        cand = _candidates(q)
        base[q] = ([c["text"] for c in cand], _torch_top5(q, cand))
    t_torch = (time.time() - t0) / len(qs)
    print(f"[torch bge-reranker-v2-m3] 평균 {t_torch*1000:.0f}ms/쿼리 (기준)", flush=True)

    # 2) 키가 있는 원격 백엔드들
    for be in ["cohere", "jina", "voyage"]:
        key = os.environ.get(rerank._PROVIDERS[be]["key_env"], "").strip()
        if not key:
            print(f"[{be}] 키 없음 — 건너뜀 ({rerank._PROVIDERS[be]['key_env']})", flush=True)
            continue
        agree = n = 0
        t0 = time.time()
        for q in qs:
            docs = base[q][0]
            try:
                ranked = rerank.remote_rerank(q, docs, TOPK, be)
            except Exception as e:
                print(f"[{be}] 실패: {e}", flush=True); break
            top5 = [docs[i] for i, _ in ranked]
            n += 1
            agree += len(set(top5) & set(base[q][1]))
        else:
            dt = (time.time() - t0) / len(qs)
            print(f"[{be} {rerank.active_model(be)}] 평균 {dt*1000:.0f}ms/쿼리 · "
                  f"torch대비 top-5 겹침 {agree}/{n*TOPK}", flush=True)


if __name__ == "__main__":
    main()
