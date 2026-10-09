"""
tests/test_rerank_api.py
────────────────────────────────────────────────────────────
호스티드 리랭크 API 백엔드(app/core/rerank) 단위 테스트.
httpx 를 모킹 — 네트워크·토치·app.main 불필요(CI 경량 환경에서 돈다).

배경(2026-10-02): torch cross-encoder 가 ARM64 CPU 에서 50쌍 ~14초 → 리랭크를
호스티드 API(Cohere/Jina/Voyage)로 이관(<1초). torch 는 무회귀 기본값.
"""

import pytest

from app.core import rerank


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    def json(self):
        return self._payload


def _mock_post(monkeypatch, capture: dict, payload, status=200):
    def fake(url, json=None, headers=None, timeout=None):  # noqa: A002
        capture["url"] = url
        capture["body"] = json
        capture["headers"] = headers
        return _Resp(payload, status)
    monkeypatch.setattr(rerank.httpx, "post", fake)


def test_backend_default_torch(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_BACKEND", raising=False)
    assert rerank.backend() == "torch"


def test_backend_env_override(monkeypatch):
    monkeypatch.setenv("RAG_RERANK_BACKEND", "Cohere")  # 대소문자·공백 정규화
    assert rerank.backend() == "cohere"


def test_active_model_defaults_and_override(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_MODEL", raising=False)
    assert rerank.active_model("jina") == "jina-reranker-v2-base-multilingual"
    assert rerank.active_model("torch").startswith("torch:")
    monkeypatch.setenv("RAG_RERANK_MODEL", "rerank-x")
    assert rerank.active_model("cohere") == "rerank-x"


def test_cohere_happy_path_sorted_topk(monkeypatch):
    monkeypatch.setenv("COHERE_API_KEY", "k")
    monkeypatch.delenv("RAG_RERANK_MODEL", raising=False)
    cap = {}
    _mock_post(monkeypatch, cap, {"results": [
        {"index": 2, "relevance_score": 0.9},
        {"index": 0, "relevance_score": 0.5},
    ]})
    out = rerank.remote_rerank("q", ["a", "b", "c"], top_k=2, be="cohere")
    assert out == [(2, 0.9), (0, 0.5)]          # 점수 내림차순
    assert cap["body"]["top_n"] == 2            # Cohere/Jina 는 top_n
    assert cap["body"]["documents"] == ["a", "b", "c"]
    assert cap["headers"]["Authorization"] == "Bearer k"


def test_voyage_uses_data_key_and_top_k(monkeypatch):
    monkeypatch.setenv("VOYAGE_API_KEY", "k")
    cap = {}
    _mock_post(monkeypatch, cap, {"data": [
        {"index": 1, "relevance_score": 0.7},
    ]})
    out = rerank.remote_rerank("q", ["a", "b"], top_k=1, be="voyage")
    assert out == [(1, 0.7)]
    assert cap["body"]["top_k"] == 1            # Voyage 는 top_k


def test_unsorted_response_gets_sorted(monkeypatch):
    monkeypatch.setenv("JINA_API_KEY", "k")
    _mock_post(monkeypatch, {}, {"results": [
        {"index": 0, "relevance_score": 0.1},
        {"index": 1, "relevance_score": 0.8},
    ]})
    assert rerank.remote_rerank("q", ["a", "b"], top_k=2, be="jina") == [(1, 0.8), (0, 0.1)]


def test_missing_key_raises(monkeypatch):
    monkeypatch.delenv("COHERE_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        rerank.remote_rerank("q", ["a"], top_k=1, be="cohere")


def test_unsupported_backend_raises(monkeypatch):
    with pytest.raises(ValueError):
        rerank.remote_rerank("q", ["a"], top_k=1, be="nope")


def test_empty_documents_returns_empty(monkeypatch):
    monkeypatch.setenv("COHERE_API_KEY", "k")
    assert rerank.remote_rerank("q", [], top_k=5, be="cohere") == []


def test_http_error_propagates(monkeypatch):
    monkeypatch.setenv("COHERE_API_KEY", "k")
    _mock_post(monkeypatch, {}, {"results": []}, status=500)
    with pytest.raises(RuntimeError):
        rerank.remote_rerank("q", ["a"], top_k=1, be="cohere")


def test_topk_clamped_to_doc_count(monkeypatch):
    monkeypatch.setenv("COHERE_API_KEY", "k")
    cap = {}
    _mock_post(monkeypatch, cap, {"results": [{"index": 0, "relevance_score": 0.5}]})
    rerank.remote_rerank("q", ["a"], top_k=10, be="cohere")
    assert cap["body"]["top_n"] == 1            # 문서 1개면 top_n=1 로 클램프
