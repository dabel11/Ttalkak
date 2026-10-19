"""
app/core/rerank.py
────────────────────────────────────────────────────────────
호스티드 리랭크 API(Cohere / Jina / Voyage) 백엔드. torch cross-encoder(bge-reranker-v2-m3)는
ARM64 CPU 에서 50쌍 ~14초가 걸려 /query 지연의 95%를 차지했다(실측 2026-10-02). 생성을 Gemini로
옮긴 것과 같은 전략으로 리랭크도 호스티드 API로 옮기면 <1초 + 품질 동급 이상.

설계: 이 모듈은 httpx 만 쓰는 순수 HTTP 호출(토치·모델 무관) — CI 에서 모킹해 테스트 가능.
retriever 가 RAG_RERANK_BACKEND 로 이 경로/torch 를 고르고, 실패하면 torch 로 폴백한다.
"""
import os

import httpx

# 프로바이더별 엔드포인트·기본 모델·키 환경변수
_PROVIDERS = {
    "cohere": {
        "url": "https://api.cohere.com/v2/rerank",
        "model": "rerank-v3.5",
        "key_env": "COHERE_API_KEY",
        "top_param": "top_n",
    },
    "jina": {
        "url": "https://api.jina.ai/v1/rerank",
        "model": "jina-reranker-v2-base-multilingual",
        "key_env": "JINA_API_KEY",
        "top_param": "top_n",
    },
    "voyage": {
        "url": "https://api.voyageai.com/v1/rerank",
        "model": "rerank-2",
        "key_env": "VOYAGE_API_KEY",
        "top_param": "top_k",
    },
}


def backend() -> str:
    """RAG_RERANK_BACKEND: torch(기본·무회귀) | cohere | jina | voyage."""
    return (os.environ.get("RAG_RERANK_BACKEND", "") or "torch").strip().lower()


def active_model(be: str | None = None) -> str:
    be = be or backend()
    p = _PROVIDERS.get(be)
    if not p:
        return "torch:bge-reranker-v2-m3"
    return os.environ.get("RAG_RERANK_MODEL", "") or p["model"]


def _timeout() -> float:
    try:
        return float(os.environ.get("RAG_RERANK_TIMEOUT", "") or 10.0)
    except ValueError:
        return 10.0


def remote_rerank(query: str, documents: list[str], top_k: int,
                  be: str | None = None) -> list[tuple[int, float]]:
    """호스티드 리랭크 호출 → [(원본 인덱스, 관련도 점수)] 를 점수 내림차순 top_k 로.

    세 프로바이더(Cohere/Jina/Voyage)는 요청·응답이 거의 동일하다:
      요청  {model, query, documents:[...], top_n|top_k}
      응답  {results:[{index, relevance_score}]}  (Voyage 는 data:[...])
    키가 없거나 HTTP/파싱 오류면 예외를 올린다 — 호출부(retriever)가 torch 로 폴백."""
    be = (be or backend())
    p = _PROVIDERS.get(be)
    if not p:
        raise ValueError(f"지원하지 않는 리랭크 백엔드: {be}")
    key = os.environ.get(p["key_env"], "").strip()
    if not key:
        raise RuntimeError(f"{p['key_env']} 미설정 — {be} 리랭크 불가")
    if not documents:
        return []

    n = min(top_k, len(documents))
    body = {
        "model": active_model(be),
        "query": query,
        "documents": documents,
        p["top_param"]: n,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    resp = httpx.post(p["url"], json=body, headers=headers, timeout=_timeout())
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results", data.get("data", []))
    out: list[tuple[int, float]] = []
    for r in results:
        idx = r.get("index")
        score = r.get("relevance_score", r.get("score"))
        if idx is None or score is None:
            continue
        out.append((int(idx), float(score)))
    out.sort(key=lambda t: -t[1])
    return out[:n]
