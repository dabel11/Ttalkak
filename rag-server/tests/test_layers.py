"""
tests/test_layers.py
────────────────────────────────────────────────────────────
카드 층(layer) 어휘와 분류 배치의 계약 테스트. LLM·DB 없이 돈다.

여기서 지키는 계약:
  · **미분류 카드는 검색에 포함된다** — 배치가 실패해도 코퍼스가 비지 않는다(무회귀)
  · 어휘 밖 층 이름은 버린다(통제 어휘)
  · 실패한 카드는 조용히 사라지지 않고 layer="" 로 남는다
  · 429 는 재시도하고, 그 외 에러는 재시도하지 않는다
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rag.layers import (  # noqa: E402
    CARD_LAYERS, LAYER_NAMES, LAYERS_VERSION, SEARCHABLE_LAYERS,
    build_layer_catalog, filter_searchable, get_card_layer, is_searchable,
    normalize_layer, summarize_layer_coverage,
)
from ingestion.tag_layers import (  # noqa: E402
    apply_overrides, build_layer_prompt, is_rate_limited, load_overrides,
    parse_layer_result, tag_cards,
)


def _card(layer=None, name="X"):
    meta = {"technique": name}
    if layer is not None:
        meta["layer"] = layer
    return {"id": 1, "document": f"Technique: {name}", "metadata": meta, "technique": name}


# ── 어휘 ────────────────────────────────────────────────────
def test_layer_vocabulary_is_wellformed() -> None:
    assert LAYERS_VERSION
    assert set(LAYER_NAMES) == set(CARD_LAYERS)
    for name, spec in CARD_LAYERS.items():
        assert name == name.lower() and " " not in name
        assert spec["definition"].strip() and spec["test"].strip()
    # 검색 대상은 어휘의 부분집합이어야 한다
    assert set(SEARCHABLE_LAYERS) <= set(LAYER_NAMES)


def test_normalize_layer_enforces_controlled_vocabulary() -> None:
    assert normalize_layer("user_instruction") == "user_instruction"
    assert normalize_layer("  User-Instruction ") == "user_instruction"
    assert normalize_layer("made_up") == ""
    assert normalize_layer(None) == ""
    assert normalize_layer(["user_instruction"]) == ""


def test_layer_catalog_stays_short() -> None:
    """긴 시나리오 예시를 넣으면 모델이 무관한 카드에 복사한다(analyzer 실측 경고)."""
    catalog = build_layer_catalog()
    for name in LAYER_NAMES:
        assert name in catalog
    assert len(catalog) < 700, "층 카탈로그가 길어지면 분류가 오염된다"


# ── ⭐ 무회귀 계약: 미분류는 검색에 포함 ──────────────────────
def test_unclassified_cards_stay_searchable() -> None:
    """배치가 실패하거나 신규 카드가 아직 분류 전이어도 코퍼스가 비면 안 된다.

    `embedding_views` 가 NULL 이면 종전 동작인 것과 같은 원칙."""
    assert is_searchable(_card())                      # layer 키 없음
    assert is_searchable(_card(layer=""))              # 빈 값
    assert is_searchable(_card(layer="made_up"))       # 어휘 밖 → 미분류 취급
    assert is_searchable({"id": 1})                    # metadata 자체가 없음


def test_only_excluded_layers_are_filtered_out() -> None:
    assert is_searchable(_card(layer="user_instruction"))
    assert not is_searchable(_card(layer="meta"))
    assert not is_searchable(_card(layer="system"))
    assert not is_searchable(_card(layer="degenerate"))


def test_filter_searchable_preserves_order() -> None:
    cards = [_card("user_instruction", "A"), _card("meta", "B"),
             _card(None, "C"), _card("system", "D"), _card("user_instruction", "E")]
    assert [c["technique"] for c in filter_searchable(cards)] == ["A", "C", "E"]


def test_summarize_layer_coverage() -> None:
    cards = [_card("user_instruction"), _card("user_instruction"),
             _card("meta"), _card("system"), _card("degenerate"), _card(None)]
    got = summarize_layer_coverage(cards)
    assert got["totalCards"] == 6
    assert got["unclassified"] == 1
    assert got["counts"]["user_instruction"] == 2
    assert got["searchable"] == 3          # user_instruction 2 + 미분류 1
    assert got["excluded"] == 3
    assert got["searchable"] + got["excluded"] == got["totalCards"]


def test_get_card_layer_handles_garbage() -> None:
    assert get_card_layer(_card("meta")) == "meta"
    assert get_card_layer(_card("made_up")) == ""
    assert get_card_layer({"metadata": "문자열"}) == ""


# ── 분류 배치 ───────────────────────────────────────────────
def test_prompt_states_the_dividing_question() -> None:
    """v2 의 기준은 '붙는가'(문법)가 아니라 '좋아지는가'(효용)다.

    v1 은 '덧붙일 수 있는가'로 물어서 실패했다 — 명령문이면 무엇이든 붙으므로
    Temperature 처럼 효과가 없는 카드까지 통과했다(34/170 엇갈림)."""
    prompt = build_layer_prompt("Technique: Role Prompting")
    assert "결과물이 더 좋아지는가" in prompt
    assert "붙일 수 있는가'를 묻는 게 **아니다**" in prompt, "문법 판정 금지 문구가 빠지면 v1 로 회귀한다"
    assert "Role Prompting" in prompt
    for name in LAYER_NAMES:
        assert name in prompt
    # 애매할 때의 안전한 쪽이 명시돼야 한다(검색에서 빼는 쪽이 더 위험)
    assert "애매하면 user_instruction" in prompt
    # meta 과흡인 방지 문구 — v1 2차 실패 지점
    assert "meta 를 넓게 잡지 마라" in prompt


def test_parse_layer_result_rejects_invented_layers() -> None:
    assert parse_layer_result('{"layer":"meta","reason":"프롬프트를 만든다"}') == (
        "meta", "프롬프트를 만든다")
    assert parse_layer_result('{"layer":"made_up"}') == ("", "")
    assert parse_layer_result("JSON 아님") == ("", "")
    assert parse_layer_result('["meta"]') == ("", "")


def test_failed_cards_are_kept_not_dropped() -> None:
    """실패한 카드가 조용히 사라지면 '무엇이 안 됐는지'를 알 수 없다."""
    def boom(_prompt):
        raise ValueError("400 json_validate_failed")

    got = tag_cards([_card(None, "A"), _card(None, "B")], boom,
                    max_attempts=2, sleep_fn=lambda _s: None)
    assert len(got) == 2
    assert all(item["layer"] == "" and item["error"] for item in got)


def test_rate_limit_is_retried_but_other_errors_are_not() -> None:
    class Rate(Exception):
        status_code = 429

    calls = {"n": 0}

    def flaky(_prompt):
        calls["n"] += 1
        if calls["n"] < 3:
            raise Rate("rate limit")
        return '{"layer":"system","reason":"도구 호출 필요"}'

    got = tag_cards([_card(None, "A")], flaky, max_attempts=4, sleep_fn=lambda _s: None)
    assert got[0]["layer"] == "system" and calls["n"] == 3

    # 400 은 재시도해도 같다 → 재시도하지 않는다
    assert is_rate_limited(Rate()) is True
    class Bad(Exception):
        status_code = 400
    assert is_rate_limited(Bad()) is False


# ── 사람 override ───────────────────────────────────────────
def _tagged(name, layer):
    return {"id": 1, "technique": name, "layer": layer, "reason": "", "error": None}


def test_override_replaces_llm_and_records_source() -> None:
    got = apply_overrides([_tagged("Zero-Shot", "user_instruction")],
                          {"Zero-Shot": "degenerate"})
    assert got[0]["layer"] == "degenerate"
    assert got[0]["source"] == "human"


def test_override_preserves_llm_answer_for_scoring() -> None:
    """원본 LLM 판정이 사라지면 분류기 품질을 다시 잴 수 없다."""
    got = apply_overrides([_tagged("Zero-Shot", "user_instruction")],
                          {"Zero-Shot": "degenerate"})
    assert got[0]["llmLayer"] == "user_instruction"


def test_cards_without_override_keep_llm_answer() -> None:
    got = apply_overrides([_tagged("Role Prompting", "user_instruction")], {})
    assert got[0]["layer"] == "user_instruction"
    assert got[0]["source"] == "llm"
    assert got[0]["llmLayer"] == "user_instruction"


def test_missing_override_file_is_not_fatal() -> None:
    """override 파일이 없어도 배치는 돌아야 한다(무회귀)."""
    assert load_overrides("/존재하지/않는/경로.json") == {}


def test_override_file_is_wellformed() -> None:
    """실제 override 파일의 층 이름이 통제 어휘 안에 있어야 한다."""
    overrides = load_overrides()
    assert overrides, "override 파일을 읽지 못했다"
    for name, layer in overrides.items():
        assert layer in LAYER_NAMES, f"{name}: 어휘 밖 층 {layer}"


def test_override_set_is_disjoint_from_being_the_whole_truth() -> None:
    """⚠️ override 가 회귀 셋 전체를 덮으면 회귀 점수가 구조적으로 100%가 된다.

    파일 분리 원칙이 지켜지는지 확인 — override 는 회귀 셋보다 작아야 한다."""
    import json as _json
    from pathlib import Path as _Path
    set_path = _Path(__file__).resolve().parents[1] / "eval" / "layer_set.json"
    cases = _json.loads(set_path.read_text(encoding="utf-8"))["cases"]
    assert len(load_overrides()) < len(cases), (
        "override 가 회귀 셋만큼 커지면 분류기 품질을 측정할 수 없다")


def run_tests() -> None:
    tests = [
        test_override_replaces_llm_and_records_source,
        test_override_preserves_llm_answer_for_scoring,
        test_cards_without_override_keep_llm_answer,
        test_missing_override_file_is_not_fatal,
        test_override_file_is_wellformed,
        test_override_set_is_disjoint_from_being_the_whole_truth,
        test_layer_vocabulary_is_wellformed,
        test_normalize_layer_enforces_controlled_vocabulary,
        test_layer_catalog_stays_short,
        test_unclassified_cards_stay_searchable,
        test_only_excluded_layers_are_filtered_out,
        test_filter_searchable_preserves_order,
        test_summarize_layer_coverage,
        test_get_card_layer_handles_garbage,
        test_prompt_states_the_dividing_question,
        test_parse_layer_result_rejects_invented_layers,
        test_failed_cards_are_kept_not_dropped,
        test_rate_limit_is_retried_but_other_errors_are_not,
    ]
    for test in tests:
        test()
        print(f"PASS: {test.__name__}")
    print(f"\n전체 {len(tests)}개 테스트 통과")


if __name__ == "__main__":
    run_tests()
