"""
tests/test_concurrency.py
────────────────────────────────────────────────────────────
LLM 생성 구간 게이트의 계약 테스트. LLM·DB 없이 스레드만으로 돈다.

지키는 계약:
  · 동시 실행은 limit 을 절대 넘지 않는다 (이게 깨지면 429 → Gemini 폴백 → RPD 소진)
  · 무한 대기는 없다 — 상한을 넘으면 GateTimeout
  · 줄이 꽉 차면 기다리지 않고 즉시 GateBusy (다 같이 타임아웃 나는 것 방지)
  · 예외가 나도 슬롯은 반드시 반납된다 (누수되면 서버가 영구히 막힌다)
"""

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.concurrency import Gate, GateBusy, GateTimeout  # noqa: E402


def _run(gate, hold, results, idx, barrier=None):
    try:
        if barrier:
            barrier.wait(timeout=5)
        with gate.enter():
            results[idx] = "in"
            time.sleep(hold)
            results[idx] = "done"
    except GateBusy:
        results[idx] = "busy"
    except GateTimeout:
        results[idx] = "timeout"
    except Exception as e:                                  # noqa: BLE001
        results[idx] = f"err:{type(e).__name__}"


def test_serializes_to_limit() -> None:
    """동시 실행 수가 limit 을 넘지 않아야 한다 — 게이트의 존재 이유."""
    gate = Gate(limit=1, depth=5, wait_seconds=5)
    peak = {"now": 0, "max": 0}
    lock = threading.Lock()

    def work():
        with gate.enter():
            with lock:
                peak["now"] += 1
                peak["max"] = max(peak["max"], peak["now"])
            time.sleep(0.05)
            with lock:
                peak["now"] -= 1

    threads = [threading.Thread(target=work) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert peak["max"] == 1, f"동시 실행 {peak['max']}건 — 직렬화가 깨졌다"


def test_limit_above_one_is_respected() -> None:
    gate = Gate(limit=2, depth=5, wait_seconds=5)
    peak = {"now": 0, "max": 0}
    lock = threading.Lock()

    def work():
        with gate.enter():
            with lock:
                peak["now"] += 1
                peak["max"] = max(peak["max"], peak["now"])
            time.sleep(0.05)
            with lock:
                peak["now"] -= 1

    threads = [threading.Thread(target=work) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)
    assert peak["max"] == 2


def test_queue_full_fails_fast() -> None:
    """줄이 꽉 차면 기다리지 않고 즉시 거절한다.

    기다리게 하면 대기자 전원이 타임아웃 나고, 그 사이 클라이언트 연결도 물린다."""
    gate = Gate(limit=1, depth=1, wait_seconds=5)
    results = {}
    # 1명 실행 + 1명 대기 + 1명은 자리가 없어 즉시 거절되어야 한다
    threads = [threading.Thread(target=_run, args=(gate, 0.4, results, i)) for i in range(3)]
    for t in threads:
        t.start()
        time.sleep(0.05)          # 순서를 확정해 경합을 없앤다
    for t in threads:
        t.join(timeout=10)

    assert results[0] == "done"
    assert results[1] == "done", "대기 슬롯이 있으면 기다렸다 성공해야 한다"
    assert results[2] == "busy", f"줄이 꽉 찼는데 즉시 거절되지 않았다: {results[2]}"


def test_wait_timeout_is_bounded() -> None:
    """앞 요청이 오래 걸리면 무한 대기가 아니라 GateTimeout."""
    gate = Gate(limit=1, depth=3, wait_seconds=0.15)
    results = {}
    t0 = threading.Thread(target=_run, args=(gate, 1.0, results, 0))
    t0.start()
    time.sleep(0.05)
    t1 = threading.Thread(target=_run, args=(gate, 0.0, results, 1))
    t1.start()

    started = time.perf_counter()
    t1.join(timeout=5)
    waited = time.perf_counter() - started

    assert results[1] == "timeout"
    assert waited < 0.9, f"대기 상한이 안 걸렸다({waited:.2f}s)"
    t0.join(timeout=5)


def test_slot_released_on_exception() -> None:
    """본문에서 예외가 나도 슬롯은 반납된다 — 누수되면 서버가 영구히 막힌다."""
    gate = Gate(limit=1, depth=1, wait_seconds=1)

    for _ in range(3):
        try:
            with gate.enter():
                raise ValueError("생성 실패")
        except ValueError:
            pass

    # 슬롯이 살아 있다면 여기서 즉시 잡혀야 한다
    with gate.enter():
        pass
    assert gate.waiting == 0


def test_waiting_count_returns_to_zero() -> None:
    """대기 카운터가 새면 이후 요청이 계속 GateBusy 로 거절된다."""
    gate = Gate(limit=1, depth=2, wait_seconds=2)
    results = {}
    threads = [threading.Thread(target=_run, args=(gate, 0.1, results, i)) for i in range(3)]
    for t in threads:
        t.start()
        time.sleep(0.02)
    for t in threads:
        t.join(timeout=10)
    assert gate.waiting == 0, f"대기 카운터 누수: {gate.waiting}"


def test_stats_shape() -> None:
    gate = Gate(limit=1, depth=2, wait_seconds=40)
    got = gate.stats()
    assert got["limit"] == 1 and got["depth"] == 2
    assert got["waitSeconds"] == 40 and got["waiting"] == 0


def test_free_slot_skips_queue_accounting() -> None:
    """슬롯이 비어 있으면 depth=0 이어도 통과해야 한다(줄을 설 필요가 없다)."""
    gate = Gate(limit=1, depth=0, wait_seconds=1)
    with gate.enter():
        pass
    # depth=0 이면 '대기'는 불가 — 점유 중일 때는 즉시 거절
    holder_in = threading.Event()
    release = threading.Event()

    def hold():
        with gate.enter():
            holder_in.set()
            release.wait(timeout=5)

    t = threading.Thread(target=hold)
    t.start()
    assert holder_in.wait(timeout=5)
    try:
        with gate.enter():
            raise AssertionError("점유 중인데 통과했다")
    except GateBusy:
        pass
    finally:
        release.set()
        t.join(timeout=5)


def run_tests() -> None:
    tests = [
        test_serializes_to_limit,
        test_limit_above_one_is_respected,
        test_queue_full_fails_fast,
        test_wait_timeout_is_bounded,
        test_slot_released_on_exception,
        test_waiting_count_returns_to_zero,
        test_stats_shape,
        test_free_slot_skips_queue_accounting,
    ]
    for test in tests:
        test()
        print(f"PASS: {test.__name__}")
    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()
