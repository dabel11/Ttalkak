"""
tests/test_backend_routing.py
────────────────────────────────────────────────────────────
Generator 메인 백엔드 선택(GEN_PRIMARY)과 폴백, analyzer 백엔드 선택(ANALYZER_BACKEND)
단위 테스트 (실제 API 호출 없음 — 가짜 백엔드/클라이언트 주입).

배경(2026-09-27): Groq 무료 한도 때문에 생성을 Gemini 3.6 Flash 로, 분석기를 Gemini
Flash-Lite 로 옮길 수 있게 백엔드를 환경변수로 열었다. 기본값은 종전(groq)이라 무회귀여야 한다.

실행: python3 -m pytest tests/test_backend_routing.py -q
"""

import os

import app.rag.generator as g
import app.rag.analyzer as a


# ── 가짜 백엔드 ──────────────────────────────────────────────
class _FakeGroq:
    def generate(self, **k):
        return "GROQ_OUT"


class _FakeGemini:
    def generate(self, **k):
        return "GEMINI_OUT"


class _FailBackend:
    def __init__(self, msg):
        self.msg = msg

    def generate(self, **k):
        raise RuntimeError(self.msg)


def _make(primary_env, groq=True, gemini=True):
    """Generator.__init__ 의 우선순위 결정부를 실제 코드로 재현(클라이언트만 가짜)."""
    if primary_env is None:
        os.environ.pop("GEN_PRIMARY", None)
    else:
        os.environ["GEN_PRIMARY"] = primary_env
    gen = g.Generator.__new__(g.Generator)
    gen._groq = _FakeGroq() if groq else None
    gen._gemini = _FakeGemini() if gemini else None
    pref = os.environ.get("GEN_PRIMARY", "groq").strip().lower()
    if pref == "gemini" and gen._gemini:
        gen._primary, gen._using = gen._gemini, "gemini"
    elif gen._groq:
        gen._primary, gen._using = gen._groq, "groq"
    else:
        gen._primary, gen._using = gen._gemini, "gemini"
    return gen


_SHORT = "글 써줘"   # 장문 라우팅이 걸리지 않는 짧은 입력


def test_default_is_groq():
    """미설정 = 종전 동작(Groq 메인) — 무회귀."""
    try:
        assert _make(None).generate(query=_SHORT, contexts=[]) == "GROQ_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_gen_primary_gemini():
    """GEN_PRIMARY=gemini → 생성 메인이 Gemini."""
    try:
        assert _make("gemini").generate(query=_SHORT, contexts=[]) == "GEMINI_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_gen_primary_groq_explicit():
    try:
        assert _make("groq").generate(query=_SHORT, contexts=[]) == "GROQ_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_gemini_primary_without_groq_key():
    """gemini 지정 + Groq 키 없음 → Gemini 단독."""
    try:
        assert _make("gemini", groq=False).generate(query=_SHORT, contexts=[]) == "GEMINI_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_gemini_primary_falls_back_to_groq():
    """Gemini 메인 실패 → 반대편(Groq) 폴백."""
    try:
        gen = _make("gemini")
        gen._primary = gen._gemini = _FailBackend("gemini 429")
        assert gen.generate(query=_SHORT, contexts=[]) == "GROQ_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_groq_primary_falls_back_to_gemini():
    """Groq 메인 실패 → Gemini 폴백(종전 동작 유지)."""
    try:
        gen = _make("groq")
        gen._primary = gen._groq = _FailBackend("groq 429")
        assert gen.generate(query=_SHORT, contexts=[]) == "GEMINI_OUT"
    finally:
        os.environ.pop("GEN_PRIMARY", None)


def test_no_fallback_when_alone_raises():
    """폴백 백엔드가 없으면 원래 예외를 그대로 올린다."""
    try:
        gen = _make("gemini", groq=False)
        gen._primary = gen._gemini = _FailBackend("gemini 죽음")
        gen._groq = None
        raised = False
        try:
            gen.generate(query=_SHORT, contexts=[])
        except RuntimeError:
            raised = True
        assert raised
    finally:
        os.environ.pop("GEN_PRIMARY", None)


# ── 분석기 백엔드 ────────────────────────────────────────────
class _FakeGeminiResp:
    text = '{"taskType":"글쓰기","fields":[{"name":"주제","role":"required","status":"empty"}]}'


class _FakeGeminiModels:
    def __init__(self, sink):
        self.sink = sink

    def generate_content(self, **k):
        self.sink.update(model=k["model"], cfg=k["config"])
        return _FakeGeminiResp()


class _FakeGeminiClient:
    def __init__(self, sink):
        self.models = _FakeGeminiModels(sink)


def test_analyzer_gemini_backend(monkeypatch):
    """ANALYZER_BACKEND=gemini → google-genai 경로로 호출하고 JSON 을 파싱한다."""
    sink = {}
    monkeypatch.setattr(a, "_BACKEND", "gemini")
    monkeypatch.setattr(a, "_gemini_client", _FakeGeminiClient(sink))
    monkeypatch.setattr(a, "_gemini_init_failed", False)

    out = a.analyze("블로그 글 써줘")
    assert out is not None and out["taskType"] == "글쓰기"
    assert sink["model"] == a._GEMINI_MODEL
    assert sink["cfg"].response_mime_type == "application/json"
    assert sink["cfg"].system_instruction == a._SYSTEM
    # 형식 판단이라 thinking 은 최소 예산으로(기본 512 — 3.5-flash-lite 는 0 을 거부)
    assert sink["cfg"].thinking_config.thinking_budget == a._GEMINI_THINKING


def test_analyzer_gemini_retries_without_thinking_on_400(monkeypatch):
    """모델이 thinking 예산을 거부(400)하면 thinking 설정 없이 1회 재시도한다."""
    calls = []

    class _Resp:
        text = '{"taskType":"글쓰기","fields":[{"name":"주제","role":"required","status":"empty"}]}'

    class _Models:
        def generate_content(self, **k):
            calls.append(k["config"])
            if getattr(k["config"], "thinking_config", None) is not None:
                raise RuntimeError("400 INVALID_ARGUMENT")
            return _Resp()

    class _Client:
        models = _Models()

    monkeypatch.setattr(a, "_BACKEND", "gemini")
    monkeypatch.setattr(a, "_gemini_client", _Client())
    monkeypatch.setattr(a, "_gemini_init_failed", False)

    out = a.analyze("블로그 글 써줘")
    assert out is not None and out["taskType"] == "글쓰기"
    assert len(calls) == 2                                   # thinking 시도 → 실패 → 재시도
    assert calls[1].thinking_config is None


def test_gemini_503_converts_to_runtimeerror(monkeypatch):
    """Gemini 503(과부하)이 반복되면 RuntimeError 로 변환된다 — 그래야 Generator 가 Groq 로 폴백한다.
    종전엔 ServerError 가 그대로 올라가 `except RuntimeError` 를 못 타서 폴백이 안 됐다(2026-09-29)."""
    from google.genai.errors import ServerError

    gen = g.GeminiGenerator.__new__(g.GeminiGenerator)   # __init__(API 키) 우회

    class _Models:
        def generate_content(self, **k):
            raise ServerError(503, {"error": {"message": "high demand", "status": "UNAVAILABLE"}})

    class _Client:
        models = _Models()

    gen.client = _Client()
    monkeypatch.setattr(g.time, "sleep", lambda *_: None)   # 백오프 대기 건너뛰기
    monkeypatch.setattr(g, "_resolve_gemini_model", lambda m: "gemini-3.6-flash")

    raised = None
    try:
        gen.generate(query="글 써줘", contexts=[])
    except Exception as e:
        raised = e
    assert isinstance(raised, RuntimeError), f"기대 RuntimeError, 실제 {type(raised)}"


def test_analyzer_gemini_missing_key_returns_none(monkeypatch):
    """gemini 백엔드인데 클라이언트가 없으면 분석 실패(None) — 파이프라인은 1단계로 무해 퇴화."""
    monkeypatch.setattr(a, "_BACKEND", "gemini")
    monkeypatch.setattr(a, "_gemini_client", None)
    monkeypatch.setattr(a, "_gemini_init_failed", True)   # 재초기화 시도 차단
    assert a.analyze("블로그 글 써줘") is None


def test_analyzer_default_follows_gen_primary(monkeypatch):
    """ANALYZER_BACKEND 미설정 시 기본값은 GEN_PRIMARY 를 따른다(2026-10-08).
    prod 에서 Groq 분석기(느리고 편차 큼)로 조용히 떨어지던 것을 방지 — GEN_PRIMARY=gemini 면
    분석도 gemini 로 자동. GEN_PRIMARY 미설정(=groq)이면 종전처럼 groq(무회귀)."""
    monkeypatch.delenv("ANALYZER_BACKEND", raising=False)
    monkeypatch.setenv("GEN_PRIMARY", "gemini")
    assert a._default_analyzer_backend() == "gemini"
    monkeypatch.setenv("GEN_PRIMARY", "groq")
    assert a._default_analyzer_backend() == "groq"
    monkeypatch.delenv("GEN_PRIMARY", raising=False)
    assert a._default_analyzer_backend() == "groq"      # 미설정 = 무회귀
