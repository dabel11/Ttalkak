"""
tests/test_budget_retry.py
────────────────────────────────────────────────────────────
출력 예산 부족(400 / finish_reason="length") 시 **그 요청만** reasoning_effort=low 로
1회 재시도하는지. API 없이 가짜 Groq 클라이언트로 돈다.

왜 필요한가: 잘린 JSON 은 예외가 아니라 '정상 응답'으로 와서 정규식 폴백으로 **조용히**
깨진 개선안이 나갔다(2026-09-20 #6: 예산 1,817 을 완료가 전부 소진, length).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rag.generator import GroqGenerator  # noqa: E402


class _Msg:
    def __init__(self, content): self.content = content


class _Choice:
    def __init__(self, content, finish): self.message = _Msg(content); self.finish_reason = finish


class _Usage:
    prompt_tokens = 5000
    completion_tokens = 1800


class _Resp:
    def __init__(self, content, finish):
        self.choices = [_Choice(content, finish)]
        self.usage = _Usage()


class _FakeClient:
    """호출 기록을 남기고, 지정한 순서대로 응답/예외를 돌려준다."""

    def __init__(self, script): self.script = list(script); self.calls = []

    @property
    def chat(self): return self

    @property
    def completions(self): return self

    def create(self, **kwargs):
        self.calls.append(kwargs.get("reasoning_effort"))
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def _gen(script):
    g = object.__new__(GroqGenerator)      # __init__ 은 API 키를 요구한다
    g.client = _FakeClient(script)
    return g


def _call(g):
    return g._complete("openai/gpt-oss-120b", [{"role": "user", "content": "x"}], 1800, 5200, None)


def test_truncated_output_raises_budget_short():
    from app.rag.generator import _BudgetShort
    g = _gen([_Resp('{"mode":"improve","improved', "length")])
    with pytest.raises(_BudgetShort):
        _call(g)


def test_generate_retries_with_low_effort_once(monkeypatch):
    monkeypatch.delenv("GEN_REASONING_EFFORT", raising=False)
    g = _gen([_Resp('{"mode":"improve","improved', "length"),
              _Resp('{"mode":"improve","improved_prompt":"완성"}', "stop")])
    out = g.generate(query="q", contexts=[], model="gemini-2.0-flash", history=[], analysis=None)
    assert "완성" in out
    assert g.client.calls == [None, "low"]          # 기본 경로는 추론량 미지정, 재시도만 low


def test_low_effort_truncation_is_not_retried_again(capsys):
    """low 로도 잘리면 더 재시도하지 않는다(무한 재시도 방지). 이때는 하드 실패(503)로 만들지 않고
    잘린 내용이라도 돌려주되 **경고를 남긴다** — 폴백 경로가 부분 개선안이라도 건지게."""
    g = _gen([_Resp('{"mode":"improve","improved', "length"),
              _Resp('{"mode":"improve","잘림', "length")])
    out = g.generate(query="q", contexts=[], model="gemini-2.0-flash", history=[], analysis=None)
    assert "잘림" in out
    assert g.client.calls == [None, "low"]
    assert "⚠️" in capsys.readouterr().out


def test_normal_response_calls_once():
    g = _gen([_Resp('{"mode":"improve","improved_prompt":"ok"}', "stop")])
    out = g.generate(query="q", contexts=[], model="gemini-2.0-flash", history=[], analysis=None)
    assert "ok" in out
    assert g.client.calls == [None]
