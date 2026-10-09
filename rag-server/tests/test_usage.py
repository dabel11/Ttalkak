"""
tests/test_usage.py
────────────────────────────────────────────────────────────
요청 단위 토큰 사용량 수집기(app/core/usage.py) 단위 테스트.

핵심 계약:
- 수집기가 안 열려 있으면 record() 는 무동작(무회귀 — eval·직접호출 경로 보호)
- start→record→drain 으로 요청 기록을 모으고, drain 은 격리를 위해 수집기를 닫는다
- summarize 는 제미나이 사고 토큰을 출력(billed)에 합산한다

실행: python3 -m pytest tests/test_usage.py -q
"""

from app.core import usage


def test_inactive_record_is_noop():
    """start() 없이 record() 하면 아무것도 안 쌓인다."""
    usage.drain()                      # 혹시 열려 있으면 닫기
    usage.record("generate", "groq", "m", prompt=100, completion=50)
    assert usage.drain() == []


def test_start_record_drain():
    rid = usage.start(request_id="req-1", turn_index=2)
    assert rid == "req-1"
    usage.record("analyze", "gemini", "gemini-3.5-flash-lite", prompt=1500, completion=200)
    usage.record("generate", "gemini", "gemini-3.6-flash",
                 prompt=5000, completion=650, thoughts=700, cached=0)
    recs = usage.drain()
    assert len(recs) == 2
    assert recs[0]["request_id"] == "req-1" and recs[0]["turn_index"] == 2
    assert recs[0]["stage"] == "analyze" and recs[1]["stage"] == "generate"
    assert recs[1]["thoughts_tokens"] == 700


def test_drain_closes_collector():
    """drain 후에는 수집기가 닫혀 다음 record 가 무시된다(요청 간 격리)."""
    usage.start(request_id="req-2")
    usage.record("generate", "gemini", "m", prompt=10)
    assert len(usage.drain()) == 1
    usage.record("generate", "gemini", "m", prompt=99)   # 닫힌 뒤
    assert usage.drain() == []


def test_start_generates_request_id():
    rid = usage.start()
    assert isinstance(rid, str) and len(rid) >= 8
    usage.drain()


def test_summarize_bills_thoughts_as_output():
    recs = [
        {"request_id": "r", "turn_index": 0, "stage": "analyze", "backend": "gemini",
         "model": "lite", "prompt_tokens": 1500, "completion_tokens": 200,
         "thoughts_tokens": None, "cached_tokens": None},
        {"request_id": "r", "turn_index": 0, "stage": "generate", "backend": "gemini",
         "model": "flash", "prompt_tokens": 5000, "completion_tokens": 650,
         "thoughts_tokens": 700, "cached_tokens": 3840},
    ]
    s = usage.summarize(recs)
    assert s["calls"] == 2
    assert s["input_tokens"] == 6500
    assert s["output_tokens"] == 850          # 보이는 출력만
    assert s["thoughts_tokens"] == 700
    assert s["billed_output_tokens"] == 1550  # 출력 + 사고 (제미나이 과금 기준)
    assert s["cached_tokens"] == 3840


def test_summarize_empty():
    s = usage.summarize([])
    assert s["calls"] == 0 and s["input_tokens"] == 0 and s["request_id"] is None
