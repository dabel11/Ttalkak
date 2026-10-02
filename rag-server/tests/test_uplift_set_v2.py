"""uplift_set_v2.json 정합성 테스트 — 평가셋이 '원래 요청에서만 기준을 뽑는다'는 규칙을 지키는지."""

import json
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
SET = json.loads((EVAL_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))
ITEMS = SET["items"]

CHECK_TYPES = set(SET["check_types"])
BASES = {"request", "preserve", "gold"}


def test_ids_unique_and_count():
    ids = [it["id"] for it in ITEMS]
    assert len(ids) == len(set(ids))
    assert len(ITEMS) >= 40


def test_fields_valid():
    for it in ITEMS:
        assert it["track"] in SET["tracks"], it["id"]
        assert it["task_type"] in {"generate", "transform"}, it["id"]
        assert it["specificity"] in {"high", "mid", "low"}, it["id"]
        assert it.get("tuning_overlap") in {None, "exact_task", "similar"}, it["id"]
        assert it["query"].strip(), it["id"]
        assert it["requirements"], it["id"]
        for r in it["requirements"]:
            assert set(r) <= {"text", "subjective"} and r["text"].strip(), (it["id"], r)
        for g in it.get("gold", []):
            assert set(g) <= {"text", "conditional"} and g["text"].strip(), (it["id"], g)
        for c in it["checks"]:
            assert c["type"] in CHECK_TYPES, (it["id"], c)
            assert c["basis"] in BASES, (it["id"], c)


def test_track_follows_specificity():
    """A = 조건을 충분히 준 요청, B = 조건이 부족한 요청."""
    for it in ITEMS:
        assert it["track"] == ("A" if it["specificity"] == "high" else "B"), it["id"]


def test_fragile_check_types_removed():
    """캐시 결과물 대조에서 오판이 확인된 판정 방식은 다시 들어오면 안 된다(WORKLOG 2026-09-16).
    줄·문장 수는 머리말을 세고, 분량 환산은 근사치라 요구사항(judge)으로 옮겼다."""
    assert not CHECK_TYPES & {"max_lines", "max_sentences", "char_range"}
    assert "global_checks" not in SET  # 정규식 빈칸·거부 감지 → defects(judge)로 대체
    assert set(SET["defects"]) >= {"fabrication", "placeholder_defect", "refusal"}


def test_no_fabrication_gold_duplicates():
    """지어내기는 defects.fabrication 이 전 문항에 판정한다 — 문항별 gold 에 또 적으면 이중 계산."""
    for it in ITEMS:
        for g in it.get("gold", []):
            assert "지어내지" not in g["text"], (it["id"], g)


def test_preserve_values_come_from_query():
    """preserve 확인값은 사용자가 준 사실이어야 한다 — 원래 요청에 그대로 있어야 한다.
    딸각이 덧붙인 조건이 채점 기준으로 새어 들어오는 것을 막는다. 번역 문항만 예외."""
    for it in ITEMS:
        q = it["query"].lower()
        for c in it["checks"]:
            if c["basis"] != "preserve" or c.get("translated"):
                continue
            if "all" in c:
                missing = [v for v in c["all"] if v.lower() not in q]
                assert not missing, (it["id"], missing)
            else:
                assert any(v.lower() in q for v in c["any"]), (it["id"], c["any"])


def test_length_limits_are_binding():
    """분량 제한이 있는 가공 문항은 원문이 제한보다 길어야 측정 의미가 있다."""
    for it in ITEMS:
        if it["task_type"] != "transform":
            continue
        for c in it["checks"]:
            if c["type"] == "max_chars":
                source = it["query"].split(":", 1)[1]
                assert len(source) > c["n"], (it["id"], len(source))


def test_v1_items_carried_over_verbatim():
    """기존 uplift_set.json 8문항은 그대로 포함 — 이전 측정과 비교 가능해야 한다."""
    v1 = json.loads((EVAL_DIR / "uplift_set.json").read_text(encoding="utf-8"))["items"]
    v2_queries = [it["query"] for it in ITEMS[: len(v1)]]
    assert v2_queries == [it["query"] for it in v1]


def test_no_new_items_copied_from_tuning_sets():
    """딸각 프롬프트 조정에 쓴 셋과 같은 요청은 tuning_overlap 표시 없이 들어오면 안 된다."""
    tuning = set()
    for name in ("gen_set.json", "halluc_set.json"):
        for it in json.loads((EVAL_DIR / name).read_text(encoding="utf-8"))["items"]:
            tuning.add(it["query"].strip().rstrip("."))
    for it in ITEMS:
        if it.get("tuning_overlap"):
            continue
        assert it["query"].strip().rstrip(".") not in tuning, it["id"]


def test_distribution_supports_breakdown():
    """트랙·작업 유형별 분해 보고가 가능하도록 각 그룹이 충분히 있어야 한다."""
    tracks = [it["track"] for it in ITEMS]
    assert tracks.count("A") >= 15
    assert tracks.count("B") >= 15
    kinds = [it["task_type"] for it in ITEMS]
    assert kinds.count("transform") >= 12
    assert kinds.count("generate") >= 12


# ── judge 결함 판정 검증 표본(defect_canary) ──────────────────
CANARY = json.loads((EVAL_DIR / "defect_canary_set.json").read_text(encoding="utf-8"))["cases"]


HOLDOUT = json.loads((EVAL_DIR / "defect_holdout_set.json").read_text(encoding="utf-8"))["cases"]
HOLDOUT2 = json.loads((EVAL_DIR / "defect_holdout2_set.json").read_text(encoding="utf-8"))["cases"]


def test_holdout_does_not_reuse_canary_outputs():
    """별도 검증용은 조정용과 결과물이 겹치면 의미가 없다."""
    outs = [{c["output"] for c in s} for s in (CANARY, HOLDOUT, HOLDOUT2)]
    assert not (outs[0] & outs[1]) and not (outs[0] & outs[2]) and not (outs[1] & outs[2])


def test_every_sample_set_is_judged():
    """접두사가 바뀌어도 결함 없는 표본이 judge 실행에서 빠지지 않게(2026-09-19 ho2_ 로 전부 빠졌던 버그)."""
    from eval.defect_canary import judge_relevant, sample_kind
    for c in CANARY + HOLDOUT + HOLDOUT2:
        if sample_kind(c["id"]) == "neg":
            assert judge_relevant(c), c["id"]


def test_canary_cases_well_formed():
    ids = {it["id"]: it for it in ITEMS}
    from eval.defect_canary import sample_kind
    for c in CANARY + HOLDOUT + HOLDOUT2:
        assert sample_kind(c["id"]) in {"pos", "neg"}, c["id"]
        assert c["query"] == ids[c["item"]]["query"], c["id"]  # 평가셋과 같은 요청이어야 한다
        assert set(c["expect"]) <= set(SET["defects"]) - {"_note"}, c["id"]
        if sample_kind(c["id"]) == "pos":
            assert True in c["expect"].values(), c["id"]
        else:
            assert not any(c["expect"].values()), c["id"]
        for m in c["must_mention"]:
            assert m in c["output"], (c["id"], m)  # 결과물에 실제로 있는 표현만 요구


def test_canary_grade_logic():
    from eval.defect_canary import grade
    case = {"task_type": "transform", "expect": {"fabrication": True}, "must_mention": ["2024"]}
    ok = {"fabrication": True, "refusal": False, "fabricated_items": ["지원 마감: 2024년 7월 31일"]}
    assert grade(case, ok) == []
    assert grade(case, {**ok, "fabricated_items": ["근무 시간"]}) == ["결함 목록에 '2024' 없음"]
    assert grade(case, {**ok, "fabrication": False}) != []
    assert grade(case, {}) == ["판정 JSON 불완전"]
    # expect 에 없는 결함 키는 채점하지 않는다
    assert grade(case, {**ok, "refusal": True}) == []
    # 결함이라고 해 놓고 근거 항목이 없으면 실패
    assert "fabrication=true 인데 fabricated_items 비어 있음" in grade(
        {**case, "expect": {}, "must_mention": []}, {**ok, "fabricated_items": []})
    # 생성 작업의 지어내기는 judge 가 판정하지 않는다(코드 몫) — 기대와 달라도 채점 안 함
    gen = {"task_type": "generate", "expect": {"fabrication": True, "refusal": False}, "must_mention": ["10%"]}
    assert grade(gen, {"fabrication": False, "refusal": False, "fabricated_items": []}) == []


def test_defect_roles_split():
    """2026-09-19 역할 분리 — 자리표시자 결함·생성 작업 지어내기는 코드, 나머지는 judge."""
    d = SET["defects"]
    assert d["placeholder_defect"]["by"] == "code"
    assert d["fabrication"]["generate"]["by"] == "code"
    assert d["fabrication"]["transform"]["by"] == "judge"
    assert d["refusal"]["by"] == "judge"
    assert "바꿔" in d["fabrication"]["transform"]["text"]   # 사실 변경(네트워크 모듈)
    assert "동시에 거부" in d["refusal"]["text"]              # 거부가 지어내기에 묻힘(2026-09-17)
    from eval.defect_canary import build_system
    system = build_system(d)
    assert "독립적으로" in system and "⟦자리표시자⟧" in system
    assert "placeholder_defect" not in system                 # judge 에 묻지 않는다


def test_entity_facts_only_on_generate():
    for it in ITEMS:
        if it.get("entity_facts"):
            assert it["task_type"] == "generate", it["id"]
    assert sum(bool(it.get("entity_facts")) for it in ITEMS) >= 10
