"""
tests/test_usage.py
────────────────────────────────────────────────────────────
토큰 usage 집계 계약 테스트 (LLM·DB·네트워크 없음).

지키는 계약:
  A. 요청 usage 는 내부 LLM 호출들의 **합**이다(분석기 + 생성기[+ 변환/HyDE][+ 폴백]).
  B. **성공한 호출만** 센다 — 실패(429/413 등)로 예외가 난 호출은 sink 에 안 들어간다.
  C. provider 응답에 usage 가 없으면 0 으로 남긴다(추정치로 지어내지 않는다).
  D. usage_sink 를 안 넘기면(기본 None) 기존 동작 그대로 — 무회귀.

app.main / app.core.embeddings 는 import 하지 않는다(모델 다운로드·MySQL 접속 유발).
"""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.usage import groq_usage, gemini_usage, summarize, usage_record  # noqa: E402
from app.rag import analyzer  # noqa: E402


# ── 가짜 provider 응답 ──────────────────────────────────────
def _groq_resp(content: str, prompt=0, completion=0, total=None):
    usage = SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion,
                            total_tokens=total)
    msg = SimpleNamespace(content=content)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)], usage=usage)


def _gemini_resp(text: str, prompt=0, candidates=0, total=None):
    meta = SimpleNamespace(prompt_token_count=prompt,
                           candidates_token_count=candidates,
                           total_token_count=total)
    return SimpleNamespace(text=text, usage_metadata=meta)


# ── C. usage 추출: Groq / Gemini ────────────────────────────
def test_groq_usage_extraction():
    rec = groq_usage(_groq_resp("{}", prompt=1800, completion=350), "analyze",
                     "openai/gpt-oss-20b")
    assert rec == {"stage": "analyze", "model": "openai/gpt-oss-20b",
                   "input_tokens": 1800, "output_tokens": 350, "total_tokens": 2150}


def test_gemini_usage_extraction_and_total_fallback():
    # total_token_count 가 None 이어도 input+output 으로 합계를 채운다
    rec = gemini_usage(_gemini_resp("{}", prompt=500, candidates=120, total=None),
                       "generate", "gemini-flash-latest")
    assert rec["input_tokens"] == 500 and rec["output_tokens"] == 120
    assert rec["total_tokens"] == 620


def test_usage_missing_is_zero_not_invented():
    # usage 필드 자체가 없는 응답 → 0 (추정치로 지어내지 않는다)
    rec = groq_usage(SimpleNamespace(choices=[]), "generate", "openai/gpt-oss-120b")
    assert rec["input_tokens"] == 0 and rec["output_tokens"] == 0 and rec["total_tokens"] == 0


def test_int_coercion_handles_none_and_negative():
    rec = usage_record("generate", "m", None, -5, None)
    assert rec["input_tokens"] == 0 and rec["output_tokens"] == 0


# ── A. 합산 + breakdown ─────────────────────────────────────
def test_summarize_sums_all_calls():
    calls = [
        usage_record("analyze",  "openai/gpt-oss-20b",  1800, 350),
        usage_record("generate", "openai/gpt-oss-120b", 5200, 1200),
    ]
    s = summarize(calls)
    assert s["input_tokens"] == 7000
    assert s["output_tokens"] == 1550
    assert s["total_tokens"] == 8550
    assert [c["stage"] for c in s["calls"]] == ["analyze", "generate"]


def test_summarize_empty_is_zero():
    s = summarize([])
    assert s == {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "calls": []}
    assert summarize(None)["calls"] == []


# ── B. 성공한 호출만 센다 (analyzer 경로로 검증) ─────────────
class _FakeCompletions:
    def __init__(self, payload, prompt, completion):
        self._payload, self._p, self._c = payload, prompt, completion

    def create(self, **_kw):
        return _groq_resp(json.dumps(self._payload, ensure_ascii=False),
                          prompt=self._p, completion=self._c)


class _FakeClient:
    def __init__(self, payload, prompt=1800, completion=350):
        self._c = _FakeCompletions(payload, prompt, completion)

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self._c


class _BoomClient:
    """create() 가 항상 터진다 — 실패한 호출은 usage 에 안 들어가야 한다."""
    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, **_kw):
        raise RuntimeError("429 rate limit")


def _with_client(client, fn):
    original = analyzer._get_client
    analyzer._get_client = lambda: client
    try:
        return fn()
    finally:
        analyzer._get_client = original


def test_analyzer_appends_usage_on_success():
    sink: list[dict] = []
    payload = {"taskType": "글쓰기",
               "fields": [{"name": "주제", "role": "required",
                           "status": "filled", "value": "제주도 여행"}],
               "techniqueAxes": []}
    result = _with_client(_FakeClient(payload, prompt=1834, completion=210),
                          lambda: analyzer.analyze("제주도 여행 블로그", usage_sink=sink))
    assert result is not None
    assert len(sink) == 1
    assert sink[0]["stage"] == "analyze"
    assert sink[0]["model"] == analyzer._MODEL
    assert sink[0]["input_tokens"] == 1834 and sink[0]["output_tokens"] == 210


def test_analyzer_failed_call_not_counted():
    sink: list[dict] = []
    result = _with_client(_BoomClient(),
                          lambda: analyzer.analyze("블로그 글 써줘", usage_sink=sink))
    assert result is None          # 실패 → None (무회귀)
    assert sink == []              # 청구 안 되는 호출은 세지 않는다


def test_analyzer_no_sink_still_works():
    # D. sink 를 안 넘기면 기존 동작 그대로(예외 없음)
    payload = {"taskType": "글쓰기", "fields": [], "techniqueAxes": ["tone_style"]}
    result = _with_client(_FakeClient(payload), lambda: analyzer.analyze("블로그"))
    assert result is not None and result["techniqueAxes"] == ["tone_style"]


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
