"""
tests/test_query_endpoint.py
────────────────────────────────────────────────────────────
실제 HTTP /query 경로(FastAPI)를 TestClient 로 검증하는 엔드포인트 회귀 테스트.
스텁은 **모델·DB·공급자만**(app.rag.retriever/indexer/generator/query_transform/analyzer).
fastapi·라우팅·app.core.gate(게이트)·concurrency(GateBusy)·usage 는 real → 실제 ASGI 경로.
실행: pytest tests/test_query_endpoint.py

정책(2026-10): 무의미 입력은 404(예시 코퍼스 게이트, AUC 1.000). 단
- 예시 '검색 실패'(인프라 장애)는 404 아님 → 기법 기반 생성으로 폴백(examples_ok)
- 후속 턴(history 있음)은 게이트하지 않음
- 생성 실패 503, 동시성 제한 503 + Retry-After
"""
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient


def _module(name, **values):
    m = ModuleType(name)
    m.__dict__.update(values)
    return m


def _load_main():
    # 모델(retriever/embeddings)·DB(indexer)·공급자(generator/analyzer/query_transform)만 스텁.
    # app.main 네임스페이스를 오염시키지 않도록 고유 모듈명으로 로드한다.
    stubs = {
        "uvicorn": _module("uvicorn"),                       # ASGI 서버(CI 미설치) — import 통과용
        "dotenv": _module("dotenv", load_dotenv=lambda **k: None),
        "app.rag.indexer": _module("app.rag.indexer", Indexer=Mock),
        "app.rag.retriever": _module("app.rag.retriever", Retriever=Mock),
        "app.rag.generator": _module("app.rag.generator", Generator=Mock),
        "app.rag.query_transform": _module("app.rag.query_transform"),
        "app.rag.analyzer": _module("app.rag.analyzer"),
    }
    spec = importlib.util.spec_from_file_location(
        "query_http_main", Path(__file__).parents[1] / "app" / "main.py")
    mod = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, stubs):
        spec.loader.exec_module(mod)
    return mod


main = _load_main()
client = TestClient(main.app)

PROMPT = "회의록 작성 프롬프트를 만들어줘"
IMPROVED = "너는 회의록 작성 전문가다. 참석자·결정사항·액션아이템을 표로 정리하라."
GEN = dict(mode="improve", answer=IMPROVED, improved_prompt=IMPROVED,
           techniques_applied=["역할 지정"], changes=["출력 형식 명시"],
           score=9, summary="회의록 개선", questions=[], fields=[])
TECH = dict(text="역할 지정 기법", metadata={"id": 1}, score=0.6)
EX = dict(text="회의록 예시", metadata={}, score=0.8)
WEAK_EX = dict(text="무관", metadata={}, score=0.1)       # 임계치(0.53) 미만


def _post(**body):
    return client.post("/query", json={"query": PROMPT, **body})


def test_garbage_input_is_404():
    """기법 0건 + 예시 약함 → 무근거 게이트 404 (HTTP)."""
    with patch.object(main.retriever, "search", side_effect=[[], [WEAK_EX]]):
        r = _post()
    assert r.status_code == 404


def test_valid_request_generates():
    """예시 점수 충분 → 200 + 개선 프롬프트."""
    with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
         patch.object(main, "run_generation", return_value=GEN):
        r = _post()
    assert r.status_code == 200
    assert r.json()["improved_prompt"] == IMPROVED


def test_example_search_failure_falls_back_to_technique():
    """★예시 '검색 실패'는 404 아님 — 기법 기반 생성 폴백(examples_ok). 리뷰 지적 버그 회귀방지."""
    with patch.object(main.retriever, "search",
                      side_effect=[[TECH], RuntimeError("example lookup failed")]), \
         patch.object(main, "run_generation", return_value=GEN) as gen:
        r = _post()
    assert r.status_code == 200
    assert r.json()["improved_prompt"] == IMPROVED
    gen.assert_called_once()


def test_followup_turn_generates_without_evidence():
    """후속 턴(history 있음)은 근거 0건이어도 게이트하지 않고 200 생성."""
    with patch.object(main.retriever, "search", return_value=[]), \
         patch.object(main, "run_generation", return_value=GEN):
        r = _post(history=[{"role": "user", "content": PROMPT}])
    assert r.status_code == 200
    assert r.json()["improved_prompt"] == IMPROVED


def test_generation_failure_is_503():
    """생성 실패(RuntimeError) → 503."""
    with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
         patch.object(main, "run_generation", side_effect=RuntimeError("generation unavailable")):
        r = _post()
    assert r.status_code == 503


def test_concurrency_limit_is_503_with_retry_after():
    """동시성 제한(GateBusy) → 503 + Retry-After 헤더."""
    with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
         patch.object(main, "run_generation", side_effect=main.GateBusy("busy")):
        r = _post()
    assert r.status_code == 503
    assert r.headers.get("Retry-After") == "30"


def test_empty_examples_corpus_falls_back_to_technique():
    """예시 코퍼스가 비어 있으면(미적재) 게이트에서 예시 제외 → 기법 폴백(전건 404 방지)."""
    with patch.object(main.retriever, "search", side_effect=[[TECH], []]), \
         patch.object(main.retriever, "collection_size", return_value=0), \
         patch.object(main, "run_generation", return_value=GEN):
        r = _post()
    assert r.status_code == 200
    assert r.json()["improved_prompt"] == IMPROVED


def test_garbage_with_populated_corpus_still_404():
    """코퍼스에 데이터가 있는데 매칭 0건(무의미 입력)이면 여전히 404 — 안전장치가 게이트를 약화시키지 않음."""
    with patch.object(main.retriever, "search", side_effect=[[], []]), \
         patch.object(main.retriever, "collection_size", return_value=20):
        r = _post()
    assert r.status_code == 404


def test_technique_evidence_preserved_in_sources():
    """기법 근거가 응답 sources 로 보존된다."""
    with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
         patch.object(main, "run_generation", return_value=GEN):
        r = _post()
    assert r.status_code == 200
    assert len(r.json()["sources"]) == 1
