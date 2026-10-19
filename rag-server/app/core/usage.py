"""
app/core/usage.py
────────────────────────────────────────────────────────────
요청 1건이 쓴 LLM 토큰을 '요청 단위'로 모으는 창구.

왜: 월 구독 규모를 역산하려면 실사용량을 요청 식별자와 함께 남겨야 한다(WORKLOG 2026-09-29).
종전엔 생성기(Groq)만 print 로 흘렸고 제미나이·분석기는 기록조차 없었다.

동작: `contextvars` 로 **요청별 수집기**를 둔다. `/query` 핸들러가 `start()` 로 열고,
각 LLM 호출부(생성기·분석기)가 `record()` 로 한 줄씩 넣고, 핸들러가 `drain()` 으로 뽑아
응답 `usage` 필드에 담는다.

⭐ 무회귀: 수집기가 안 열려 있으면(`start()` 미호출 — eval·단위테스트·직접 호출) `record()` 는
**아무것도 안 한다**. 그래서 기존 호출 경로·시그니처는 그대로 둔다.

동시성: FastAPI 동기 엔드포인트는 요청마다 스레드풀의 한 스레드에서 끝까지 실행되고, 생성/분석
호출도 그 안에서 동기로 일어난다. `contextvars` 는 그 컨텍스트에 격리되므로 요청 간 섞이지 않는다.
"""
from __future__ import annotations

import contextvars
import time
import uuid

_sink: contextvars.ContextVar[list | None] = contextvars.ContextVar("usage_sink", default=None)
_meta: contextvars.ContextVar[dict] = contextvars.ContextVar("usage_meta", default={})


def start(request_id: str | None = None, turn_index: int = 0) -> str:
    """요청 수집기를 연다. request_id 미지정 시 생성. 반환: 사용된 request_id."""
    rid = request_id or uuid.uuid4().hex
    _sink.set([])
    _meta.set({"request_id": rid, "turn_index": turn_index})
    return rid


def record(stage: str, backend: str, model: str, *,
           prompt: int | None = None, completion: int | None = None,
           thoughts: int | None = None, cached: int | None = None) -> None:
    """LLM 호출 1건의 사용량을 기록. 수집기가 안 열려 있으면 무동작(무회귀).

    stage: 'analyze' | 'generate'  · backend: 'groq' | 'gemini'
    prompt=입력, completion=출력(제미나이는 '보이는 출력'), thoughts=사고 토큰(제미나이),
    cached=캐시 적중 입력. Groq 는 completion 에 추론이 포함되고 thoughts 는 None."""
    sink = _sink.get()
    if sink is None:
        return
    m = _meta.get()
    sink.append({
        "request_id": m.get("request_id"),
        "turn_index": m.get("turn_index"),
        "stage": stage,
        "backend": backend,
        "model": model,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "thoughts_tokens": thoughts,
        "cached_tokens": cached,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })


def drain() -> list[dict]:
    """이번 요청에 쌓인 기록을 반환하고 수집기를 닫는다(다음 요청과 격리)."""
    sink = _sink.get() or []
    _sink.set(None)
    return list(sink)


def _tok(*vals: int | None) -> int:
    return sum(v for v in vals if isinstance(v, int))


def summarize(records: list[dict]) -> dict:
    """요청 총계. 제미나이는 사고 토큰도 출력으로 과금되므로 billed_output 에 합산한다."""
    billed_output = _tok(*[r.get("completion_tokens") for r in records],
                         *[r.get("thoughts_tokens") for r in records])
    return {
        "request_id": records[0]["request_id"] if records else None,
        "turn_index": records[0]["turn_index"] if records else 0,
        "calls": len(records),
        "input_tokens": _tok(*[r.get("prompt_tokens") for r in records]),
        "output_tokens": _tok(*[r.get("completion_tokens") for r in records]),
        "thoughts_tokens": _tok(*[r.get("thoughts_tokens") for r in records]),
        "billed_output_tokens": billed_output,
        "cached_tokens": _tok(*[r.get("cached_tokens") for r in records]),
    }
