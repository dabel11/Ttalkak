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
    c = rep["comparisons"]["요구사항 충족률(주관 제외)"]["ttalkak − raw"]
    assert c["n"] == 1 and c["mean_diff"] == 0.5        # 되묻기로 빠진 up_09 는 짝 비교에서 제외
    assert rep["ask_rate"]["ttalkak"]["asked"] == 1


def test_partial_judge_is_not_scored():
    """일부 질문만 답한 판정으로 충족률을 내면 답한 질문만으로 계산돼 수치가 흔들린다(2026-11-06 팀원 지적 ②)."""
    from eval.uplift_score import score_output
    it = ITEMS["up_04"]
    qs = build_questions(it)
    full = {"questions": qs, "errors": [], "answers": {q["id"]: {"verdict": "yes"} for q in qs}}
    part = {**full, "answers": {qs[0]["id"]: {"verdict": "yes"}}, "errors": ["r2: 답 없음/형식 오류"]}
    assert score_output(it, "1. A\n2. B\n3. C", full, None)["requirement_rate"] == 1.0
    s = score_output(it, "1. A\n2. B\n3. C", part, None)
    assert s["requirement_rate"] is None and s["gold_rate"] is None     # 짝 비교·평균에서 자동 제외
    assert s["judge_errors"] == ["r2: 답 없음/형식 오류"]


def test_code_tasks_are_out_of_fabrication_scope():
    """코드 속 예시 값·테스트 데이터를 judge 가 지어내기로 봤다(2026-09-19 두 번째 검증) — 범위 밖으로."""
    from eval.uplift_score import score_output
    r = score_output(ITEMS["up_03"], "```python\nassert get_user(1) == {'name': 'Alice'}\n```", None,
                     {"verdict": {"fabrication": True, "refusal": False}})
    assert r["fabrication"] is None and r["refusal"] is False


# ── 채점 백엔드 선택(_pick_backend) — 외부 호출 없음 ─────────────────
import pytest


@pytest.mark.parametrize("primary, groq, gemini, expected", [
    ("gemini", "g", "m", "gemini"),   # 양쪽 키 + 명시 Gemini
    (None, None, "m", "gemini"),      # 미설정 + Gemini 단독(종전 규칙 보존)
    (None, "g", None, "groq"),        # 미설정 + Groq 단독
    (None, "g", "m", "groq"),         # 미설정 + 양쪽 키 → 종전처럼 groq 우선
])
def test_pick_backend(monkeypatch, primary, groq, gemini, expected):
    from eval.uplift_eval import _pick_backend
    for name, value in (("GEN_PRIMARY", primary), ("GROQ_API_KEY", groq), ("GEMINI_API_KEY", gemini)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    assert _pick_backend() == expected


@pytest.mark.parametrize("primary, groq, gemini", [
    ("gemini", "g", None),            # 명시한 백엔드의 키 누락 → 다른 키로 몰래 채점하지 않음
    ("groq", None, "m"),
    (None, None, None),               # 키 없음
])
def test_pick_backend_missing_key(monkeypatch, primary, groq, gemini):
    from eval.uplift_eval import _pick_backend
    for name, value in (("GEN_PRIMARY", primary), ("GROQ_API_KEY", groq), ("GEMINI_API_KEY", gemini)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    with pytest.raises(EnvironmentError):
        _pick_backend()


def test_report_warns_when_judge_models_mix(capsys):
    """Groq 로 채점한 파일을 Gemini 로 이어 돌리면 판정 모델이 섞인다 — 한 표에 합치면 안 된다(2026-11-11)."""
    from eval.uplift_score import print_report, report
    def rec(item, judge):
        return {"item": item, "condition": "raw", "repeat": 0, "judge_model": judge,
                "score": {"requirement_rate": 1.0, "gold_rate": None, "check_rate": {},
                          "fabrication": None, "refusal": False, "placeholder_defect": False}}
    data = {"records": {"up_04|raw|0": rec("up_04", "openai/gpt-oss-120b"),
                        "up_09|raw|0": rec("up_09", "gemini-3.6-flash")}, "pairs": {}}
    rep = report(data, ITEMS)
    assert rep["judge_models"] == ["gemini-3.6-flash", "openai/gpt-oss-120b"]
    print_report(rep)
    assert "판정 모델이 섞였다" in capsys.readouterr().out


def test_gemini_models_come_from_generator(monkeypatch):
    """Gemini 모델명을 이 파일에 적지 않는다 — gemini-2.0-flash 는 이 계정에서 호출 불가였다."""
    from app.rag.generator import default_model
    from eval.uplift_score import default_models
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    assert default_models("gemini") == (default_model("gemini"),) * 2
    assert default_models("groq") == ("openai/gpt-oss-20b", "openai/gpt-oss-120b")


def test_truncated_or_incomplete_records_are_rerun():
    from eval.uplift_score import _needs_run
    assert _needs_run(None)
    assert _needs_run({"req_incomplete": True, "exec_finish": "stop"})
    assert _needs_run({"req_incomplete": False, "exec_finish": "length"})     # 출력 예산에서 잘림(2026-11-13)
    assert not _needs_run({"req_incomplete": False, "exec_finish": "stop"})
    assert not _needs_run({"asked": True})                                    # 되묻기는 다시 돌리지 않는다


def test_judge_pair_needs_both_orders_and_records_version():
    """순서를 바꾼 두 번이 같은 쪽일 때만 승부, 판정기 버전·종료 사유를 남긴다."""
    from types import SimpleNamespace as NS
    from eval.uplift_score import PAIR_JUDGE_VERSION, judge_pair

    def client(answers):
        it = iter(answers)
        create = lambda **kw: NS(choices=[NS(message=NS(content=next(it)), finish_reason="stop")], usage=None)
        return NS(chat=NS(completions=NS(create=create)))

    item = {"query": "q"}
    same = judge_pair(client(['{"winner": "2"}', '{"winner": "1"}']), "m", item, "a", "b")   # 두 번 다 b
    split = judge_pair(client(['{"winner": "1"}', '{"winner": "1"}']), "m", item, "a", "b")  # 위치만 따라감
    assert same["winner"] == "b" and split["winner"] == "tie"
    assert same["version"] == PAIR_JUDGE_VERSION and same["finish"] == ["stop", "stop"]
