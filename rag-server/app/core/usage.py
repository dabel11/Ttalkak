"""
app/core/usage.py
────────────────────────────────────────────────────────────
LLM 토큰 사용량 집계 — /query 한 번이 내부적으로 여러 번 모델을 호출하므로
(분석기 + 생성기, 옵션으로 쿼리변환/HyDE, Groq 실패 시 Gemini 폴백),
각 호출의 usage 를 한 리스트(sink)에 모아 요청 단위로 합산한다.

설계 원칙
- **순수 함수만.** 모델·DB·무거운 의존성을 import 하지 않는다(CI tests 가 그대로
  import 할 수 있어야 한다 — requirements-test.txt 참고).
- **성공한 호출만 센다.** 429/413 로 거절된 호출은 토큰이 청구되지 않으므로
  sink 에 넣지 않는다(호출부에서 예외가 나면 append 전에 빠져나간다).
- **과금은 지어내지 않는다.** provider 응답에 usage 가 없으면 0 으로 남기고,
  추정치로 채우지 않는다(추정은 generator._est_tokens 의 413 방어용이지 과금용이 아니다).

Groq(OpenAI 호환) 응답:  response.usage.{prompt_tokens, completion_tokens, total_tokens}
Gemini(google-genai) 응답: response.usage_metadata.{prompt_token_count,
                           candidates_token_count, total_token_count}
  ※ gpt-oss 계열의 '추론(reasoning) 토큰'은 completion_tokens 에 이미 포함되어
    청구되므로 별도 가산하지 않는다(실측 청구 기준과 일치).
"""

from __future__ import annotations


def _int(value: object) -> int:
    """None·문자열·float 이 섞여 와도 안전하게 0 이상의 정수로."""
    try:
        n = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return n if n > 0 else 0


def usage_record(stage: str, model: str,
                 input_tokens: int, output_tokens: int,
                 total_tokens: int | None = None) -> dict:
    """한 번의 LLM 호출에 대한 usage 레코드(과금 단위의 최소 형태)."""
    inp = _int(input_tokens)
    out = _int(output_tokens)
    tot = _int(total_tokens) or (inp + out)
    return {
        "stage": stage,       # analyze | transform | hyde | generate
        "model": model,       # 실제 호출된 모델 id (요금이 모델별로 다르다)
        "input_tokens": inp,
        "output_tokens": out,
        "total_tokens": tot,
    }


def groq_usage(response: object, stage: str, model: str) -> dict:
    """Groq(OpenAI 호환) 응답에서 usage 레코드를 뽑는다. usage 없으면 0."""
    u = getattr(response, "usage", None)
    return usage_record(
        stage, model,
        getattr(u, "prompt_tokens", 0),
        getattr(u, "completion_tokens", 0),
        getattr(u, "total_tokens", None),
    )


def gemini_usage(response: object, stage: str, model: str) -> dict:
    """Gemini(google-genai) 응답에서 usage 레코드를 뽑는다. usage 없으면 0.

    candidates_token_count 는 SDK/설정에 따라 None 으로 올 수 있어 0 으로 흡수한다."""
    u = getattr(response, "usage_metadata", None)
    return usage_record(
        stage, model,
        getattr(u, "prompt_token_count", 0),
        getattr(u, "candidates_token_count", 0),
        getattr(u, "total_token_count", None),
    )


def summarize(calls: list[dict] | None) -> dict:
    """호출별 usage 리스트를 요청 단위 합계로 접는다.

    반환: {input_tokens, output_tokens, total_tokens, calls:[...]}.
    calls 가 비어도(사용량을 못 읽었거나 LLM 호출이 없었던 경우) 0 합계 + 빈 배열을
    돌려준다 — 호출부가 None 분기를 따로 두지 않아도 되게 한다."""
    calls = list(calls or [])
    return {
        "input_tokens":  sum(c.get("input_tokens", 0) for c in calls),
        "output_tokens": sum(c.get("output_tokens", 0) for c in calls),
        "total_tokens":  sum(c.get("total_tokens", 0) for c in calls),
        "calls": calls,
    }
