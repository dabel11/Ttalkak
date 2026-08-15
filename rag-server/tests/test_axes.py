"""
tests/test_axes.py
────────────────────────────────────────────────────────────
기법 축 라우팅 단위 테스트. LLM·DB 없이 돈다.

실행:
    python3 -m pytest tests/test_axes.py -q
    python3 -m tests.test_axes
"""

from app.rag.axes import (
    AXES_VERSION,
    AXIS_NAMES,
    MAX_AXES_PER_CARD,
    MAX_AXES_PER_REQUEST,
    MIN_CARDS_PER_AXIS,
    TECHNIQUE_AXES,
    build_axis_catalog,
    filter_cards_by_axes,
    get_card_axes,
    normalize_axes,
    summarize_axis_coverage,
)
from ingestion.tag_axes import (
    build_tagging_prompt,
    is_rate_limited,
    parse_tagging_result,
    tag_cards,
)


def card(technique, axes=None, document="본문"):
    metadata = {"technique": technique}
    if axes is not None:
        metadata["axes"] = axes
    return {"document": document, "metadata": metadata}


def test_axis_vocabulary_is_wellformed() -> None:
    """어휘가 흔들리면 태깅과 조회가 서로 못 만난다."""
    assert len(TECHNIQUE_AXES) == len(set(TECHNIQUE_AXES))
    assert len(AXIS_NAMES) >= 8

    for name, spec in TECHNIQUE_AXES.items():
        # 축 이름은 조회의 연결 키다. 표기가 갈리면 0건이 된다.
        assert name == name.lower()
        assert " " not in name and "-" not in name
        # 양쪽 설명이 모두 있어야 한다 — 요청 판단용과 카드 태깅용.
        assert spec["request"].strip()
        assert spec["card"].strip()


def test_normalize_axes_enforces_controlled_vocabulary() -> None:
    assert normalize_axes(["tone_style", "output_format"]) == [
        "tone_style", "output_format"
    ]

    # 어휘 밖의 값은 버린다 (LLM이 지어낸 이름).
    assert normalize_axes(["tone_style", "made_up_axis"]) == ["tone_style"]

    # 표기 흔들림 흡수 + 중복 제거 + 순서 보존
    assert normalize_axes(
        [" Tone-Style ", "tone style", "output_format"]
    ) == ["tone_style", "output_format"]

    # 상한 적용
    assert len(normalize_axes(list(AXIS_NAMES))) == MAX_AXES_PER_REQUEST

    # 잘못된 입력은 빈 리스트 → 호출자는 기존 유사도 경로로 폴백
    for bad in (None, 42, {"a": 1}, [], [None, 3]):
        assert normalize_axes(bad) == []

    # 문자열 하나도 허용
    assert normalize_axes("grounding") == ["grounding"]


def test_axis_catalog_stays_short() -> None:
    """8b는 긴 예시를 무관한 요청에 복사한다(analyzer 실측 경고)."""
    for side in ("request", "card"):
        catalog = build_axis_catalog(side)
        for name in AXIS_NAMES:
            assert name in catalog
        # 축당 한 줄
        assert len(catalog.splitlines()) == len(AXIS_NAMES)

    try:
        build_axis_catalog("wrong")
    except ValueError:
        pass
    else:
        raise AssertionError("잘못된 side는 거부되어야 합니다.")


def test_filter_cards_by_axes_ranks_by_overlap() -> None:
    cards = [
        card("A", ["output_format"]),
        card("B", ["tone_style", "length_control"]),
        card("C", ["grounding"]),
        card("D"),                       # 미태깅
    ]

    # 겹치는 축이 많은 카드가 앞으로
    got = filter_cards_by_axes(cards, ["tone_style", "length_control"])
    assert [c["metadata"]["technique"] for c in got] == ["B"]

    got = filter_cards_by_axes(cards, ["output_format", "tone_style"])
    assert [c["metadata"]["technique"] for c in got] == ["A", "B"]

    # 축이 비면 빈 결과 → 호출자가 폴백을 판단한다
    assert filter_cards_by_axes(cards, []) == []
    assert filter_cards_by_axes(cards, ["made_up"]) == []

    # 미태깅 카드는 절대 안 걸린다
    assert all(c["metadata"]["technique"] != "D" for c in got)


def test_filter_preserves_embedding_order_within_same_overlap() -> None:
    """같은 축 안에서의 순위는 임베딩이 정한다(입력 순서 유지)."""
    cards = [
        card("first", ["grounding"]),
        card("second", ["grounding"]),
        card("third", ["grounding"]),
    ]
    got = filter_cards_by_axes(cards, ["grounding"])
    assert [c["metadata"]["technique"] for c in got] == ["first", "second", "third"]


def test_get_card_axes_handles_untagged_and_garbage() -> None:
    assert get_card_axes(card("X", ["tone_style"])) == ["tone_style"]
    assert get_card_axes(card("X")) == []
    assert get_card_axes({"metadata": "문자열"}) == []
    assert get_card_axes({}) == []
    # 카드도 상한이 걸린다
    assert len(get_card_axes(card("X", list(AXIS_NAMES)))) == MAX_AXES_PER_CARD


def test_summarize_axis_coverage_flags_starved_axes() -> None:
    cards = [card(f"T{i}", ["grounding"]) for i in range(MIN_CARDS_PER_AXIS)]
    cards.append(card("only-one", ["comparison"]))
    cards.append(card("untagged"))

    report = summarize_axis_coverage(cards)

    assert report["axesVersion"] == AXES_VERSION
    assert report["totalCards"] == len(cards)
    assert report["untagged"] == 1
    assert report["counts"]["grounding"] == MIN_CARDS_PER_AXIS
    assert report["counts"]["comparison"] == 1

    # 카드가 모자란 축은 조회가 굶으므로 드러나야 한다
    assert "comparison" in report["starvedAxes"]
    assert "grounding" not in report["starvedAxes"]


def test_tagging_prompt_directs_to_prompt_template() -> None:
    """축 판정 기준은 Prompt Template 이다 — Definition 도 Use When 도 아니다."""
    prompt = build_tagging_prompt("Technique: X\nPrompt Template: 다음 조건을 지켜라")

    assert "Prompt Template" in prompt
    assert "constraints" in prompt
    assert "다음 조건을 지켜라" in prompt
    # 목록 밖 이름을 지어내지 못하게 막는다
    assert "지어내지 마라" in prompt


def test_parse_tagging_result_rejects_invented_axes() -> None:
    axes, reason = parse_tagging_result(
        '{"axes": ["constraints", "환각방지"], "reason": "조건 명시 지시문"}'
    )
    assert axes == ["constraints"]
    assert reason == "조건 명시 지시문"

    assert parse_tagging_result("JSON 아님") == ([], "")
    assert parse_tagging_result('["constraints"]') == ([], "")
    assert parse_tagging_result('{"axes": []}') == ([], "")


def test_tag_cards_keeps_failures_instead_of_dropping() -> None:
    """실패를 조용히 버리면 태깅 성숙도가 과대평가된다."""
    calls = []

    def fake_tag_call(prompt):
        calls.append(prompt)
        if "실패카드" in prompt:
            raise RuntimeError("호출 실패")
        if "무응답카드" in prompt:
            return "JSON 아님"
        return '{"axes": ["length_control"], "reason": "분량 수치 지시"}'

    cards = [
        {"id": 1, "technique": "정상", "document": "정상카드 Prompt Template: N자 내외"},
        {"id": 2, "technique": "실패", "document": "실패카드"},
        {"id": 3, "technique": "무응답", "document": "무응답카드"},
    ]

    tagged = tag_cards(cards, fake_tag_call)

    assert len(calls) == 3
    assert len(tagged) == 3
    assert tagged[0]["axes"] == ["length_control"]
    assert tagged[1]["axes"] == [] and tagged[1]["error"]
    assert tagged[2]["axes"] == [] and tagged[2]["error"] is None
    # 한 장 실패가 배치를 멈추지 않는다
    assert tagged[0]["id"] == 1 and tagged[2]["id"] == 3


def test_tagging_retries_on_rate_limit() -> None:
    """파일럿에서 22장 중 6장이 429 로 무배정 처리됐다. 재시도가 없으면 배치가 굶는다."""
    attempts = 0
    delays = []

    class RateLimited(Exception):
        status_code = 429

    def flaky(prompt):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise RateLimited("Rate limit reached")
        return '{"axes": ["constraints"], "reason": "조건 명시"}'

    tagged = tag_cards(
        [{"id": 1, "technique": "T", "document": "본문"}],
        flaky,
        base_delay_seconds=20.0,
        sleep_fn=delays.append,
    )

    assert attempts == 3
    assert delays == [20.0, 40.0]
    assert tagged[0]["axes"] == ["constraints"]
    assert tagged[0]["error"] is None

    assert is_rate_limited(RateLimited("x"))
    assert not is_rate_limited(ValueError("잘못된 입력"))


def test_tagging_does_not_retry_non_rate_limit_errors() -> None:
    attempts = 0
    delays = []

    def broken(prompt):
        nonlocal attempts
        attempts += 1
        raise ValueError("프롬프트 오류")

    tagged = tag_cards(
        [{"id": 1, "technique": "T", "document": "본문"}],
        broken,
        sleep_fn=delays.append,
    )

    assert attempts == 1
    assert delays == []
    assert tagged[0]["axes"] == [] and tagged[0]["error"]


def run_tests() -> None:
    tests = [
        test_axis_vocabulary_is_wellformed,
        test_normalize_axes_enforces_controlled_vocabulary,
        test_axis_catalog_stays_short,
        test_filter_cards_by_axes_ranks_by_overlap,
        test_filter_preserves_embedding_order_within_same_overlap,
        test_get_card_axes_handles_untagged_and_garbage,
        test_summarize_axis_coverage_flags_starved_axes,
        test_tagging_prompt_directs_to_prompt_template,
        test_parse_tagging_result_rejects_invented_axes,
        test_tag_cards_keeps_failures_instead_of_dropping,
        test_tagging_retries_on_rate_limit,
        test_tagging_does_not_retry_non_rate_limit_errors,
    ]
    for test in tests:
        test()
        print(f"PASS: {test.__name__}")
    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()
