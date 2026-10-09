"""
tests/test_query_endpoint.py
────────────────────────────────────────────────────────────
실제 /query 경로를 모델·DB·공급자 없이 검증하는 엔드포인트 회귀 테스트.
무거운 app.rag.*(indexer/retriever/generator/query_transform/analyzer)만 스텁하고,
app.core.gate(실제 게이트)·concurrency(실제 GateBusy/GateTimeout)·usage·postprocess 는 real.
실행: python -m unittest tests.test_query_endpoint  (pytest 도 자동 수집)

정책(2026-10): 무의미 입력은 404(예시 코퍼스 게이트, AUC 1.000). 단
- 예시 '검색 실패'(인프라 장애)는 404 아님 → 기법 기반 생성으로 폴백(examples_ok)
- 후속 턴(history 있음)은 게이트하지 않음
- 생성 실패 503, 동시성 제한 503 + Retry-After
"""
import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock, patch


class HTTPException(Exception):                       # fastapi.HTTPException 대역
    def __init__(self, status_code, detail, headers=None):
        self.status_code, self.detail, self.headers = status_code, detail, headers or {}


class _App:                                           # fastapi.FastAPI 대역(라우팅 데코레이터 무력화)
    def __init__(self, **kwargs): pass
    def add_middleware(self, *a, **k): pass
    def get(self, *a, **k): return lambda f: f
    def post(self, *a, **k): return lambda f: f


def _module(name, **values):
    m = ModuleType(name)
    m.__dict__.update(values)
    return m


def _load_main():
    stubs = {
        "uvicorn": _module("uvicorn"),
        "dotenv": _module("dotenv", load_dotenv=lambda **k: None),
        "fastapi": _module("fastapi", FastAPI=_App, Header=lambda **k: None,
                            HTTPException=HTTPException),
        "fastapi.middleware": _module("fastapi.middleware"),
        "fastapi.middleware.cors": _module("fastapi.middleware.cors", CORSMiddleware=object),
        "app.rag.indexer": _module("app.rag.indexer", Indexer=Mock),
        "app.rag.retriever": _module("app.rag.retriever", Retriever=Mock),
        "app.rag.generator": _module("app.rag.generator", Generator=Mock),
        "app.rag.query_transform": _module("app.rag.query_transform"),
        "app.rag.analyzer": _module("app.rag.analyzer"),
    }
    spec = importlib.util.spec_from_file_location(
        "query_endpoint_main", Path(__file__).parents[1] / "app" / "main.py")
    mod = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, stubs):
        spec.loader.exec_module(mod)
    return mod


main = _load_main()

PROMPT = "회의록 작성 프롬프트를 만들어줘"
IMPROVED = "너는 회의록 작성 전문가다. 참석자·결정사항·액션아이템을 표로 정리하라."
GEN = dict(mode="improve", answer=IMPROVED, improved_prompt=IMPROVED,
           techniques_applied=["역할 지정"], changes=["출력 형식 명시"],
           score=9, summary="회의록 개선", questions=[], fields=[])
TECH = dict(text="역할 지정 기법", metadata={"id": 1}, score=0.6)
EX = dict(text="회의록 예시", metadata={}, score=0.8)
WEAK_EX = dict(text="무관", metadata={}, score=0.1)       # 임계치(0.53) 미만


class QueryEndpointTests(unittest.TestCase):
    def _req(self, history=None, **kw):
        return main.QueryRequest(query=PROMPT, history=history, **kw)

    def test_garbage_input_is_404(self):
        """기법 0건 + 예시 약함 → 무근거 게이트 404."""
        with patch.object(main.retriever, "search", side_effect=[[], [WEAK_EX]]):
            with self.assertRaises(HTTPException) as e:
                main.query(self._req())
            self.assertEqual(404, e.exception.status_code)

    def test_valid_request_generates(self):
        """예시 점수 충분 → 생성."""
        with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
             patch.object(main, "run_generation", return_value=GEN):
            self.assertEqual(IMPROVED, main.query(self._req()).improved_prompt)

    def test_example_search_failure_falls_back_to_technique(self):
        """★예시 '검색 실패'는 404 아님 — 기법 기반 생성 폴백(examples_ok). 리뷰 지적 버그 회귀방지."""
        with patch.object(main.retriever, "search",
                          side_effect=[[TECH], RuntimeError("example lookup failed")]), \
             patch.object(main, "run_generation", return_value=GEN) as gen:
            resp = main.query(self._req())
            self.assertEqual(IMPROVED, resp.improved_prompt)
            gen.assert_called_once()

    def test_followup_turn_generates_without_evidence(self):
        """후속 턴(history 있음)은 근거 0건이어도 게이트하지 않고 생성."""
        with patch.object(main.retriever, "search", return_value=[]), \
             patch.object(main, "run_generation", return_value=GEN):
            resp = main.query(self._req(history=[{"role": "user", "content": PROMPT}]))
            self.assertEqual(IMPROVED, resp.improved_prompt)

    def test_generation_failure_is_503(self):
        """생성 실패(RuntimeError) → 503."""
        with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
             patch.object(main, "run_generation", side_effect=RuntimeError("generation unavailable")):
            with self.assertRaises(HTTPException) as e:
                main.query(self._req())
            self.assertEqual(503, e.exception.status_code)

    def test_concurrency_limit_is_503_with_retry_after(self):
        """동시성 제한(GateBusy) → 503 + Retry-After 헤더."""
        with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
             patch.object(main, "run_generation", side_effect=main.GateBusy("busy")):
            with self.assertRaises(HTTPException) as e:
                main.query(self._req())
            self.assertEqual(503, e.exception.status_code)
            self.assertIn("Retry-After", e.exception.headers)

    def test_technique_evidence_preserved_in_sources(self):
        """기법 근거가 응답 sources 로 보존된다."""
        with patch.object(main.retriever, "search", side_effect=[[TECH], [EX]]), \
             patch.object(main, "run_generation", return_value=GEN):
            self.assertEqual(1, len(main.query(self._req()).sources))


if __name__ == "__main__":
    unittest.main()
