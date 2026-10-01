"""
tests/test_gate.py
────────────────────────────────────────────────────────────
무의미 입력 게이트(main.no_evidence_gate) 단위 테스트.

배경(2026-10-01): 404 판정을 기법 코퍼스(AUC 0.694)에서 예시 코퍼스(AUC 1.000)로 이관.
근거 측정은 eval/gate_set.json + 아래 AUC. 임계치 기본 0.53(RAG_GATE_MIN_SCORE).
"""

from app.main import no_evidence_gate as gate

EX = lambda s: [{"score": s}]          # noqa: E731


def test_valid_passes():
    """정상 요청(예시 높음)은 게이트 통과(무근거 아님) — 기법 점수가 낮아도."""
    assert gate([{"score": 0.44}], EX(0.70), [], 0.53) is False


def test_garbage_blocked_even_if_technique_passes():
    """무의미 입력: 기법 점수는 통과해도 예시 낮으면 404 — 종전 버그(example.com) 해소."""
    assert gate([{"score": 0.54}], EX(0.48), [], 0.53) is True


def test_empty_examples_is_no_evidence_when_gate_on():
    """예시 활성인데 0건(=매우 낮은 점수) → 무근거."""
    assert gate([{"score": 0.54}], [], [], 0.53, examples_enabled=True) is True


def test_followup_turn_never_gated():
    """후속 턴은 대화 맥락으로 잇는다 — 게이트하지 않는다."""
    assert gate([], [], [{"role": "user", "content": "x"}], 0.53) is False


def test_gate_off_falls_back_to_technique():
    """gate_min_score=0 이면 종전 '기법 0건' 규칙."""
    assert gate([], EX(0.1), [], 0.0) is True          # 기법 0건 → 무근거
    assert gate([{"score": 0.5}], EX(0.1), [], 0.0) is False


def test_examples_disabled_falls_back_to_technique():
    """예시 비활성이면 예시 신호가 없으니 기법 폴백."""
    assert gate([{"score": 0.5}], [], [], 0.53, examples_enabled=False) is False
    assert gate([], [], [], 0.53, examples_enabled=False) is True


def test_boundary_at_threshold():
    """임계치 경계: 정확히 임계치면 통과(>=), 미만이면 차단."""
    assert gate([], EX(0.53), [], 0.53) is False        # 0.53 >= 0.53 → 통과
    assert gate([], EX(0.529), [], 0.53) is True        # 미만 → 차단
