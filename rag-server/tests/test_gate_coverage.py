"""
tests/test_gate_coverage.py
────────────────────────────────────────────────────────────
무근거 게이트 커버리지 — 평가셋(eval/gate_set.json)·평가 도구(eval/gate_eval)·예시 생성 유형
(ingestion/gen_examples.TASK_TYPES)의 구조 검사. 임베딩·DB 없이 돈다.

배경(2026-11-25): "크롤링 프로그램 작성해줘"가 404(근거 없음)로 원문 그대로 반환됐다. 게이트는
예시 코퍼스 최고 유사도만 보는데 코드 '작성' 유형 예시가 없었고, 원본 평가셋 24건(글쓰기 위주)은
그 구멍을 드러내지 못했다. 분야·상황을 넓힌 셋과 유형이 다시 좁아지지 않게 고정한다.
"""
import json
from pathlib import Path

from eval.gate_eval import ORIGINAL_DOMAIN, blocked_report, load_gate_set
from ingestion.gen_examples import TASK_TYPES, TaskType, Example, build_user_message, passes_gate

DATA = json.loads((Path(__file__).parent.parent / "eval" / "gate_set.json").read_text(encoding="utf-8"))


# ── 평가셋 ───────────────────────────────────────────────────
def test_original_sets_untouched():
    """원본 24건은 rerank_bench 등 기존 측정과 비교하려고 그대로 둔다."""
    assert len(DATA["positive"]) == 12 and len(DATA["negative"]) == 12


def test_extended_covers_many_domains():
    ext = DATA["positive_extended"]
    for domain in ["개발·IT", "업무·비즈니스", "교육·학습", "창작·미디어", "생활",
                   "개인 메시지", "전문 정보", "말투·형태 변형"]:
        assert ext.get(domain), f"분야 누락: {domain}"
    assert sum(len(v) for v in ext.values()) >= 40


def test_reported_case_is_in_set():
    """이번에 막힌 요청(오타 포함)이 회귀 측정 대상에 들어 있다."""
    qs = {q for v in DATA["positive_extended"].values() for q in v}
    assert "크롤링 프로그램 작성해줘" in qs and "크롤링 프로그램 작성해붜" in qs


def test_situation_variety():
    """짧은 요청·영어 요청·짧은 원문을 붙인 요청이 섞여 있다."""
    qs = [q for v in DATA["positive_extended"].values() for q in v]
    assert sum(1 for q in qs if len(q) <= 10) >= 5
    assert any(q.isascii() for q in qs)
    assert any(":" in q for q in qs)


def test_no_overlap_or_blank():
    pos, neg = load_gate_set(DATA)
    pos_qs = [q for _d, q in pos]
    assert all(q.strip() for q in pos_qs + neg)
    assert len(pos_qs) == len(set(pos_qs)) and len(neg) == len(set(neg))
    assert not set(pos_qs) & set(neg)


# ── 평가 도구 ────────────────────────────────────────────────
def test_load_gate_set_tags_domains_and_dedupes():
    data = {"positive": ["a", "b"], "positive_extended": {"코드": ["c", "a"]},
            "negative": ["x"], "negative_extended": ["y", "x"]}
    pos, neg = load_gate_set(data)
    assert pos == [(ORIGINAL_DOMAIN, "a"), (ORIGINAL_DOMAIN, "b"), ("코드", "c")]
    assert neg == ["x", "y"]


def test_blocked_report_uses_gate_inequality():
    """게이트는 '점수 < 임계치'면 404 — 임계치와 같은 점수는 통과."""
    pos = [("코드", "크롤링", 0.50), ("코드", "봇", 0.53), ("생활", "운동", 0.60)]
    neg = [("ㅎㅇ", 0.40), ("hello", 0.55)]
    rep = blocked_report(pos, neg, 0.53)
    assert rep["blocked"] == [("코드", "크롤링", 0.50)]
    assert rep["leaked"] == [("hello", 0.55)]
    assert rep["by_domain"]["코드"] == {"n": 2, "blocked": 1, "min": 0.50}
    assert rep["by_domain"]["생활"]["blocked"] == 0


# ── 예시 생성 유형 ───────────────────────────────────────────
def test_task_type_keys_unique():
    keys = [t.key for t in TASK_TYPES]
    assert len(keys) == len(set(keys))


def test_task_types_cover_gate_domains():
    """평가셋 분야마다 대응하는 예시 유형이 있다 — 셋만 넓히고 코퍼스는 그대로인 상태 방지."""
    keys = {t.key for t in TASK_TYPES}
    for key in ["code_write", "feature_impl", "debug_error", "howto", "spreadsheet",
                "report_plan", "customer_reply", "quiz_make", "creative_writing",
                "image_prompt", "lifestyle", "personal_message", "advice", "expert_info"]:
        assert key in keys, f"예시 유형 누락: {key}"


def test_user_message_includes_hint():
    tt = TaskType("code_write", "프로그램 코드 작성", hint="웹 크롤링, 업무 자동화")
    msg = build_user_message(tt, 2)
    assert "[소재 후보] 웹 크롤링, 업무 자동화" in msg and "2개" in msg
    assert "[소재 후보]" not in build_user_message(TaskType("x", "y"), 2)


def test_short_realistic_before_passes_curation():
    """짧은 실사용 요청 예시는 큐레이션을 통과해야 짧은 요청이 게이트를 넘는다."""
    after = "너는 숙련된 파이썬 개발자다. 아래 조건으로 웹 크롤링 프로그램을 작성하라. " * 2
    ok, _ = passes_gate(Example(before="자소서 써줘", after=after, technique="Role Prompting"))
    assert ok
    ok, reason = passes_gate(Example(before="글 써줘", after=after, technique="Role Prompting"))
    assert not ok and "짧음" in reason
