"""코드로 가리는 결함(자리표시자·요청에 없던 숫자 값)과 코드 판정 테스트. LLM 호출 없음.

사례는 실제 캐시 결과물(llama·Gemini 49건)에서 나온 표현이다 — 규칙을 만들 때 본 데이터라
여기 통과가 일반화의 증거는 아니다(WORKLOG 2026-09-19).
"""

import json
from pathlib import Path

import pytest

from eval.code_checks import body_text, run_check, run_item
from eval.placeholders import PLACEHOLDER_MASK, find_placeholders, mask
from eval.value_check import invented_values

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
ITEMS = {it["id"]: it for it in json.loads((EVAL_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}


# ── 자리표시자 ────────────────────────────────────────────────
@pytest.mark.parametrize("text", [
    "안녕하세요 [고객 이름]님", "저희 [회사명/브랜드명]은", "[OO Fintech]", "주 [X]일 재택근무",
    "이메일 지원 ([recruit@company.com])", "[주문 일자]에", "[회사 로고]", "[채용 홈페이지 URL]",
    "[온라인 지원 플랫폼]", "[사업자등록번호]", "[고객 이름 입력]", "(연락처: OOO-OOOO)", "[OOO] 고객님",
])
def test_placeholder_found(text):
    assert find_placeholders(text), text


@pytest.mark.parametrize("text", [
    "### [Card 3 : 일시 및 장소]", "1. **[결정]** QA 시작", "**[일정]** 다음 회의", "[1단계: 결정사항 추출]",
    "이메일 제목: [정중한 환불 거절 안내]", "[재택근무/신입가능] 백엔드", "[지원 방법 및 일정]",
    "rows[0] 에서 IndexError", "Dict[str, Any]", "[CRITICAL]", "[링크](https://a.com)",
    "객체지향 프로그래밍(OOP)", "```python\nx = [고객 이름]\n```",
])
def test_not_placeholder(text):
    assert not find_placeholders(text), text


def test_mask_replaces_only_placeholders():
    assert mask("[결정] [고객 이름]님, OOO-OOOO") == f"[결정] {PLACEHOLDER_MASK}님, {PLACEHOLDER_MASK}"


# ── 요청에 없던 숫자 값 ────────────────────────────────────────
Q02 = ITEMS["up_02"]["query"]


@pytest.mark.parametrize("output,expected", [
    ("* 지원 마감: 2024년 7월 31일", ["2024년"]),                    # 연도 날조 — '7월 말'→31일은 정상
    ("* Language: Java (11 이상 선호)", ["11"]),
    ("* 근무 형태: 100% 재택근무 가능", ["100%"]),
    ("* 근무 시간: 주 5일, 09:00 ~ 18:00", ["5일", "9:00", "18:00"]),
    ("* 지원 마감일: 7월 31일 23:59까지", ["23:59"]),
    ("사수와의 1:1 페어 프로그래밍", ["1"]),
])
def test_invented_values_found(output, expected):
    got = invented_values(Q02, output)
    for e in expected:
        assert any(e.lstrip("0") in g for g in got), (output, got)


@pytest.mark.parametrize("output", [
    "Java/Spring 백엔드, 경력 무관, 재택 가능, 7월 31일 마감",      # 요청 값만
    "1. 채용 분야\n2. 자격 요건\n3. 지원 방법",                       # 목록 번호
    "### [Card 1] Title\n### [Card 2] Point 1",                       # 카드·포인트 번호
    "**대안 1: 교환** 다른 상품으로\n**대안 2: 포인트** 적립",         # 라벨 번호
    "문의: [전화번호], 주소 [회사주소]",                                # 자리표시자
    "```python\nfor i in range(10): pass\n```",                         # 코드
])
def test_invented_values_ignores_structure(output):
    assert invented_values(Q02, output) == [], output


@pytest.mark.parametrize("item_id,output,expected", [
    # 2026-09-19 새 결과물(gpt-oss-20b)에서 숫자만 비교해 놓쳤던 것 — 요청 숫자와 우연히 같은 값
    ("up_38", "30분 이상 방수 테스트 완료, 30일 이내 반품, 집중력 30% 향상", ["30분", "30일", "30%"]),
    ("up_38", "음량 120dB, 20Hz~20kHz", ["20Hz", "20kHz"]),
    ("up_38", "15분 충전 4시간 재생", ["4시간"]),
    ("up_02", "재택 지원비 (월 30만원)", ["30만원"]),
])
def test_invented_values_compare_units(item_id, output, expected):
    got = invented_values(ITEMS[item_id]["query"], output)
    for e in expected:
        assert e in got, (output, got)


@pytest.mark.parametrize("item_id,output", [
    ("up_38", "배터리 30시간, 무게 4.5g, IPX4 — '프리미엄 30H'"),     # 준 값 그대로 / 같은 뜻 단위(H=시간)
    ("up_02", "지원 마감: 7월 31일"),                                   # '7월 말' → 31일
    ("up_01", "📅 7월\u202f15일 | 45,000원"),                           # 좁은 공백(U+202F)
    ("up_43", "퇴사일: 20XX년 X월 X일"),                                # 날짜 자리표시자
    ("up_46", "#우리빵집 #신제품\n\n(총 198자)"),                       # 자기 분량 메모
])
def test_invented_values_accepts_given(item_id, output):
    assert invented_values(ITEMS[item_id]["query"], output) == [], output


def test_narrow_space_does_not_fail_checks():
    """gpt-oss 는 '7월\u202f15일' 처럼 좁은 공백을 쓴다 — 맞는 결과물이 불합격되면 안 된다."""
    assert run_check({"type": "contains_any", "any": ["7월 15일"]}, "📅 7월\u202f15일")
    assert run_check({"type": "contains_any", "any": ["2 a.m."]}, "from 2\u202fa.m. to 4\u202fa.m.")


def test_date_placeholders():
    assert [s for _, _, s in find_placeholders("퇴사일: 20XX년 X월 X일")] == ["20XX년", "X월", "X일"]
    assert find_placeholders("[사건이 발생한 시기]에")
    assert not find_placeholders("2026년 7월 15일, Xbox 출시")


def test_given_times_and_month_end_are_not_invented():
    q = ITEMS["up_11"]["query"]                         # "10월 2일 오전 9시~12시, 101동 1·2호기"
    assert invented_values(q, "10월 2일 09:00~12:00, 101동 1·2호기 운행 중지") == []


# ── 코드 판정 ────────────────────────────────────────────────
def test_body_text_drops_meta_lines():
    out = "다음은 3줄 요약본이다.\n- A\n- B\n- C"
    assert body_text(out) == "- A\n- B\n- C"
    assert body_text("다음 회의록을 요약해드리겠습니다.\n\n1. A\n2. B") == "1. A\n2. B"


def test_run_check_types():
    assert run_check({"type": "contains_any", "any": ["재택"]}, "재택 가능")
    assert run_check({"type": "contains_all", "all": ["Java", "Spring"]}, "java/spring")
    assert run_check({"type": "max_chars", "n": 5}, "다음은 문자입니다.\n12345")
    assert run_check({"type": "has_table"}, "| a | b |\n|---|---|\n| 1 | 2 |")
    assert not run_check({"type": "has_table"}, "| a | b |")
    assert run_check({"type": "lang", "value": "en"}, "Service unavailable on 9/30")


def test_placeholder_defect_needs_missing_given_value():
    item = {"query": "마감 7월 말", "checks": [{"type": "contains_any", "any": ["7월 말"], "basis": "preserve"}]}
    assert run_item(item, "지원 마감: [마감일]")["placeholder_defect"] is True       # 준 값을 비움
    assert run_item(item, "지원 마감: 7월 말, 문의 [연락처]")["placeholder_defect"] is False  # 안 준 값만 비움


# ── 라벨 붙인 표본을 코드로 확인 (judge 없이) ─────────────────────
_CASES = [c for f in ("defect_canary_set.json", "defect_holdout_set.json")
          for c in json.loads((EVAL_DIR / f).read_text(encoding="utf-8"))["cases"]]


@pytest.mark.parametrize("case", _CASES, ids=[c["id"] for c in _CASES])
def test_labeled_cases_code_defects(case):
    item = ITEMS[case["item"]]
    r = run_item(item, case["output"])
    # 자리표시자 결함 — 표본 라벨은 전부 false(2026-09-17 up_06 제목 라벨 수정 후)
    assert r["placeholder_defect"] == case["expect"].get("placeholder_defect", False), r
    # 생성 작업 지어내기 — entity_facts 문항만 코드가 본다
    if case["task_type"] == "generate" and "fabrication" in case["expect"] and item.get("entity_facts"):
        assert bool(r["invented_values"]) == case["expect"]["fabrication"], r["invented_values"]
