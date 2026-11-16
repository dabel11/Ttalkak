"""사람 라벨링 시트(docx)의 답 칸 읽기 — 시트 양식이 바뀌면 κ 계산이 조용히 틀리므로 여기서 막는다."""

import json
from pathlib import Path

import pytest
from docx import Document

import eval.human_review as hr
from eval.human_review import _HDR, _OUT, EXTRA, SAMPLE, _classes, _expected, _read_sheet
from eval.requirement_judge import build_questions

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"


def _sheet(tmp_path, answers, who="A"):
    """실제 시트와 같은 모양(제목 → 질문·답 표)으로 두 문항짜리 시트를 만든다."""
    doc = Document()
    doc.add_heading("목차", level=1)
    toc = doc.add_table(rows=1, cols=2)                       # 답 표가 아닌 표는 무시돼야 한다
    toc.cell(0, 0).text, toc.cell(0, 1).text = "#", "문항"
    for n, (iid, qs) in enumerate(answers.items(), 1):
        doc.add_heading(f"{n} / {len(answers)}. {iid}", level=1)
        t = doc.add_table(rows=1, cols=4)
        for c, txt in zip(t.rows[0].cells, _HDR):
            c.text = txt
        for qid, ans in qs.items():
            cells = t.add_row().cells
            cells[0].text, cells[1].text, cells[2].text = qid, "질문 내용", ans
    path = tmp_path / f"sheet_{who}.docx"
    doc.save(path)
    return path


EXPECTED = {("up_04", "r1"): False, ("up_04", "r2"): False, ("up_04", "g1"): True,
            ("up_04", "g2"): False, ("up_08", "r1"): False}      # g1 만 조건부 — '해당없음' 허용


def test_read_sheet_keys_answers_by_item(tmp_path):
    path = _sheet(tmp_path, {"up_04": {"r1": "예", "r2": "아니오", "g1": "해당없음", "g2": ""},
                             "up_08": {"r1": "예"}})
    assert _read_sheet(path, EXPECTED) == {("up_04", "r1"): "yes", ("up_04", "r2"): "no",
                                           ("up_04", "g1"): "na", ("up_08", "r1"): "yes"}  # 빈 답은 빠진다


def test_read_sheet_rejects_unknown_answer(tmp_path):
    path = _sheet(tmp_path, {"up_04": {"r1": "ㅇㅇ"}})
    with pytest.raises(SystemExit, match="up_04 r1"):
        _read_sheet(path, EXPECTED)


def test_read_sheet_rejects_na_on_plain_question(tmp_path):
    """조건부가 아닌 질문의 '해당없음'을 받아 주면 분모에서 조용히 빠진다(2026-11-06 팀원 지적 ③)."""
    path = _sheet(tmp_path, {"up_04": {"r1": "해당없음"}})
    with pytest.raises(SystemExit, match="조건부 질문이 아닌데"):
        _read_sheet(path, EXPECTED)


def test_read_sheet_rejects_question_not_in_set(tmp_path):
    path = _sheet(tmp_path, {"up_04": {"r9": "예"}})
    with pytest.raises(SystemExit, match="평가셋에 없는 질문"):
        _read_sheet(path, EXPECTED)


def test_generated_sheet_has_a_row_per_question():
    """build 로 만든 실제 시트와 질문 목록이 어긋나면(표 양식 변경 등) 답이 조용히 누락된다."""
    items = {it["id"]: it for it in json.loads((EVAL_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
    want = sum(len(build_questions(items[i])) for i in SAMPLE) + len(SAMPLE) * len(EXTRA)
    doc = Document(_OUT / "sheet_A.docx")
    rows = sum(len(t.rows) - 1 for t in doc.tables if [c.text.strip() for c in t.rows[0].cells] == _HDR)
    assert rows == want == len(_expected()) == 115      # 요구사항 95 + 덧붙임 점검 20


def test_classes_splits_subjective_from_objective():
    """주관 질문의 낮은 κ 가 객관 질문 κ 를 끌어내리지 않게 분류를 붙인다(2026-11-09 팀원 질문)."""
    cls = _classes()
    assert len(cls) == 95                                     # x1 은 분류 대상이 아니다 — 따로 집계
    assert cls[("up_15", "r2")] == "요구사항(주관)"             # '초등학생이 이해할 쉬운 말'
    assert cls[("up_15", "r1")] == "요구사항(객관)"
    assert cls[("up_15", "g1")] == "정확성(gold)"
    assert set(cls.values()) == {"요구사항(객관)", "요구사항(주관)", "정확성(gold)"}


def test_agree_reports_each_class_separately(tmp_path, monkeypatch, capsys):
    """agree 가 분류별 줄을 실제로 찍는지 — 분류 키가 어긋나면 KeyError 로 죽는다."""
    a = {"r1": "예", "r2": "아니오", "r3": "아니오", "g1": "예", "g2": "아니오"}
    _sheet(tmp_path, {"up_15": a}, "A")
    _sheet(tmp_path, {"up_15": {**a, "r2": "예"}}, "B")        # 주관 질문만 갈린다
    (tmp_path / "judge.json").write_text(
        json.dumps({"up_15": {"r1": "yes", "r3": "no", "g1": "yes", "g2": "no"}}), encoding="utf-8")
    monkeypatch.setattr(hr, "_OUT", tmp_path)
    hr.agree(partial=True)
    out = capsys.readouterr().out
    assert "요구사항(객관) 2개" in out and "요구사항(주관) 1개" in out and "정확성(gold) 2개" in out
    assert "판정기 대 A" in out and "AC1=" in out


def test_review_materials_cover_every_case(tmp_path, monkeypatch):
    """2~4번 자료가 빠짐없이 만들어지는지 — 라벨 검토는 트랙 A 가 먼저, 경계 사례 5건, 트랙 B 요청 8칸."""
    import eval.review_materials as rm
    monkeypatch.setattr(rm, "_OUT", tmp_path)
    rm.main()
    review = Document(tmp_path / "label_review.docx")
    items = json.loads((EVAL_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]
    assert len(review.tables) == len(items) == 48
    heads = [p.text for p in review.paragraphs if p.style.name == "Heading 1"]
    assert heads[0].endswith("트랙 A") and heads[-1].endswith("트랙 B")
    for who in ("A", "B"):
        assert len(Document(tmp_path / f"boundary_{who}.docx").tables) == len(rm.BOUNDARY) == 5
    assert len(Document(tmp_path / "trackB_requests.docx").tables[0].rows) == 1 + 8


def test_ac1_survives_skewed_answers_where_kappa_collapses():
    # 2026-11-12 사람 A 시트 그대로: 객관 71개 전부 '예', 판정기 69 예 · 2 아니오 → 97% 일치
    from eval.uplift_stats import cohen_kappa, gwet_ac1
    human, judge = ["yes"] * 71, ["yes"] * 69 + ["no"] * 2
    assert cohen_kappa(human, judge) == pytest.approx(0.0)
    assert gwet_ac1(human, judge) == pytest.approx(0.971, abs=0.001)
    assert gwet_ac1(["yes"] * 5, ["yes"] * 5) == 1.0          # κ 는 정의 안 됨
    mixed_a, mixed_b = ["yes", "no"] * 10, ["yes", "no"] * 9 + ["no", "yes"]
    assert gwet_ac1(mixed_a, mixed_b) == pytest.approx(cohen_kappa(mixed_a, mixed_b), abs=0.01)  # 고르면 κ 와 같다


def test_pref_pick_fills_strata_with_must_items_and_is_stable():
    from eval.pref_materials import MUST, STRATA, pick
    types = {"원문 다듬기·변환", "짧은 창작·공지", "추천·계획", "코드"}
    cands = [{"item": f"up_{i:02d}", "rep": r, "filled": False, "type": t, "judge": j}
             for i, t in enumerate(sorted(types) * 6) for r in range(2) for j in ("raw", "ttalkak")]
    cands += [{"item": m, "rep": 0, "filled": False, "type": "원문 다듬기·변환", "judge": j}
              for m in MUST for j in ("ttalkak", "raw")]
    out = pick(cands)
    assert len(out) == sum(STRATA.values()) == 10 and len({p["item"] for p in out}) == 10   # 요청 중복 없음
    assert [p["judge"] for p in out].count("raw") == 5
    assert {p["item"]: p["judge"] for p in out if p["item"] in MUST} == {m: "raw" for m in MUST}  # 지는 쪽으로 반드시
    assert pick(cands) == out                                                                   # 시드 고정


_FILL = Path(__file__).parent.parent / "eval/results/uplift_trackB_v7_filled_20261114.json"


@pytest.mark.skipif(not _FILL.exists(), reason="빈칸 채움 결과 파일이 없다")
def test_pref_sheet_answers_read_back_per_pair(tmp_path, monkeypatch):
    """결과물마다 P1~P7, 비교 C1~C5 를 채우면 read_answers 가 쌍 번호별로 그대로 돌려준다."""
    from docx import Document
    import eval.pref_materials as pm
    monkeypatch.setattr(pm, "_OUT", tmp_path)
    key = pm.build()
    assert all(k["longer"] in (1, 2) and "shown" not in k for k in key)
    assert (tmp_path / "pref_guide.docx").exists()
    doc = Document(tmp_path / "pref_A.docx")
    for t in doc.tables[2:]:
        for r in t.rows[1:]:
            if len(r.cells) == 5:
                r.cells[2].text, r.cells[3].text = "4", "B"
            else:
                r.cells[2].text = "2"
    doc.save(tmp_path / "filled.docx")
    ans = pm.read_answers(tmp_path / "filled.docx")
    assert len(ans) == len(key)
    assert ans[1]["P4"] == ("4", "B") and ans[len(key)]["C4"] == "2"
