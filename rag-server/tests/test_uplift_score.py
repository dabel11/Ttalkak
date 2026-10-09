"""결과 상향 채점기의 비LLM 부품 테스트 — 통계·요구사항 판정 파싱·결과물 채점·보고서 집계."""

import json
from pathlib import Path

from eval.requirement_judge import build_questions, build_user_message, parse_answers, rates
from eval.uplift_stats import bootstrap_ci, paired, sign_test_p, wilson, within_spread

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
ITEMS = {it["id"]: it for it in json.loads((EVAL_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}


# ── 통계 ──────────────────────────────────────────────────────
def test_wilson_matches_known_value():
    lo, hi = wilson(6, 8)                      # 앞서 문서에 쓴 값: 약 41~93%
    assert round(lo, 2) == 0.41 and round(hi, 2) == 0.93
    assert wilson(0, 0) is None


def test_sign_test():
    assert sign_test_p(0, 0) is None
    assert sign_test_p(5, 5) == 1.0
    assert round(sign_test_p(9, 1), 4) == 0.0215   # 양측 이항


def test_bootstrap_is_deterministic_and_brackets_mean():
    d = [0.1, 0.2, 0.0, 0.3, 0.1, 0.2]
    assert bootstrap_ci(d) == bootstrap_ci(d)
    lo, hi = bootstrap_ci(d)
    assert lo <= sum(d) / len(d) <= hi
    assert bootstrap_ci([0.5]) is None


def test_paired_skips_missing_and_counts():
    a = {"x": 0.5, "y": 1.0, "z": None, "w": 0.2}
    b = {"x": 1.0, "y": 0.5, "z": 1.0, "w": 0.2}
    s = paired(a, b)
    assert s["n"] == 3 and (s["wins"], s["ties"], s["losses"]) == (1, 1, 1)


def test_within_spread():
    assert within_spread({"a": [0.5, 1.0, 0.75], "b": [1.0]}) == 0.5


# ── 요구사항 판정 파싱 ────────────────────────────────────────
def test_questions_and_message_mask_placeholders():
    it = ITEMS["up_15"]                        # 조건부 정답 항목이 있는 문항
    qs = build_questions(it)
    assert [q["id"] for q in qs if q["kind"] == "requirement"] == ["r1", "r2", "r3"]
    assert any(q["conditional"] for q in qs)
    msg = build_user_message(ITEMS["up_06"], "안녕하세요 [고객 이름]님", build_questions(ITEMS["up_06"]))
    assert "[고객 이름]" not in msg and "⟦자리표시자⟧" in msg


def test_parse_answers_flags_missing_and_illegal_na():
    qs = [{"id": "r1", "conditional": False}, {"id": "r2", "conditional": False}, {"id": "g1", "conditional": True}]
    raw = json.dumps({"answers": [{"id": "r1", "verdict": "YES", "evidence": "x"},
                                  {"id": "r2", "verdict": "na"},
                                  {"id": "g1", "verdict": "na"}]})
    p = parse_answers(raw, qs)
    assert p["answers"]["r1"]["verdict"] == "yes" and p["answers"]["g1"]["verdict"] == "na"
    assert p["errors"] == ["r2: 조건부가 아닌데 na"]
    assert parse_answers("엉망", qs)["errors"] == ["r1: 답 없음/형식 오류", "r2: 답 없음/형식 오류", "g1: 답 없음/형식 오류"]


def test_rates_exclude_subjective_na_and_errors():
    qs = [{"id": "r1", "kind": "requirement", "subjective": False, "conditional": False},
          {"id": "r2", "kind": "requirement", "subjective": False, "conditional": False},
          {"id": "r3", "kind": "requirement", "subjective": True, "conditional": False},
          {"id": "g1", "kind": "gold", "subjective": False, "conditional": True}]
    res = {"questions": qs, "answers": {"r1": {"verdict": "yes"}, "r2": {"verdict": "no"},
                                        "r3": {"verdict": "yes"}, "g1": {"verdict": "na"}}}
    assert rates(res) == {"requirement_rate": 0.5, "subjective_rate": 1.0, "gold_rate": None}


# ── 결과물 채점 ───────────────────────────────────────────────
def test_score_output_routes_defects_by_task_type():
    from eval.uplift_score import score_output
    gen = score_output(ITEMS["up_02"], "Java/Spring 신입, 재택, 마감 2024년 7월 31일", None,
                       {"verdict": {"fabrication": False, "refusal": False}})
    assert gen["fabrication"] is True                 # 생성·entity → 코드(요청에 없던 '2024년')
    assert gen["invented_values"] == ["2024년"]
    tr = score_output(ITEMS["up_04"], "1. QA 6월 말\n2. 김대리 API 문서", None,
                      {"verdict": {"fabrication": True, "refusal": False}})
    assert tr["fabrication"] is True and tr["refusal"] is False   # 가공 → judge
    code = score_output(ITEMS["up_12"], "```python\ndef f(x) -> list: ...\n```", None, None)
    assert code["fabrication"] is None                # entity 아닌 생성 문항 — 측정 범위 밖


def test_report_pairs_conditions_per_item():
    from eval.uplift_score import report
    def rec(item, cond, rep, req, asked=False):
        r = {"item": item, "condition": cond, "repeat": rep}
        if asked:
            return {**r, "asked": True}
        return {**r, "score": {"requirement_rate": req, "gold_rate": None, "check_rate": {},
                               "fabrication": None, "refusal": False, "placeholder_defect": False}}
    recs = [rec("up_04", "raw", 0, 0.5), rec("up_04", "ttalkak", 0, 1.0),
            rec("up_09", "raw", 0, 1.0), rec("up_09", "ttalkak", 0, None, asked=True)]
    data = {"records": {f"{r['item']}|{r['condition']}|{r['repeat']}": r for r in recs}, "pairs": {}}
    rep = report(data, ITEMS)
    c = rep["comparisons"]["요구사항 충족률(주관 제외) ⚠️잠정"]["ttalkak − raw"]
    assert c["n"] == 1 and c["mean_diff"] == 0.5        # 되묻기로 빠진 up_09 는 짝 비교에서 제외
    assert rep["ask_rate"]["ttalkak"]["asked"] == 1


def test_code_tasks_are_out_of_fabrication_scope():
    """코드 속 예시 값·테스트 데이터를 judge 가 지어내기로 봤다(2026-09-19 두 번째 검증) — 범위 밖으로."""
    from eval.uplift_score import score_output
    r = score_output(ITEMS["up_03"], "```python\nassert get_user(1) == {'name': 'Alice'}\n```", None,
                     {"verdict": {"fabrication": True, "refusal": False}})
    assert r["fabrication"] is None and r["refusal"] is False
