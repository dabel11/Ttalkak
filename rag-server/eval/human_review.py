"""
eval/human_review.py
────────────────────────────────────────────────────────────
사람 대조용 라벨링 시트를 만들고, 채워진 시트로 일치도를 계산한다. (자세한 배경은 eval/HUMAN_REVIEW.md)

왜 필요한가: 요구사항 충족률은 채점기의 **주 지표**인데, 판정기가 사람 판단과 맞는지 아직 모른다.
지금까지 확인한 것은 '내용을 지우면 yes→no 로 바뀐다'는 최소 민감도뿐이다(eval/req_sensitivity.py).

    python3 -m eval.human_review build              # 요청·결과물·질문·답이 한 파일에 든 라벨링 시트(docx) 2부 생성
    python3 -m eval.human_review judge              # 같은 질문을 판정기에 물어 저장
    python3 -m eval.human_review agree              # 사람끼리 · 사람 대 판정기 일치도(일치율·κ·AC1)

판정 기준(eval/HUMAN_REVIEW.md 와 같음):
  · 사람끼리 AC1 ≥ 0.6 이어야 질문이 명확한 것으로 본다. 낮으면 그 질문을 고치거나 뺀다.
    (κ 도 함께 찍지만 기준은 AC1 — 답이 '예'로 쏠리면 κ 는 일치해도 0 이 된다, 2026-11-12)
  · 판정기–사람 일치도가 사람–사람 일치도와 비슷해야 판정기 수치를 결론에 쓴다.
"""

import argparse
import json
import re
from pathlib import Path

from eval.requirement_judge import build_questions
from eval.uplift_stats import cohen_kappa, gwet_ac1

_DIR = Path(__file__).parent
_OUT = _DIR / "human_review"
SOURCE = "fresh_outputs_20260919.json"          # gpt-oss-20b 결과물 — 라벨링 대상
# 가공 10 + 생성 10 — 트랙·작업 유형이 섞이도록 고름
SAMPLE = ["up_04", "up_08", "up_15", "up_16", "up_17", "up_19", "up_20", "up_30", "up_35", "up_36",
          "up_01", "up_02", "up_06", "up_09", "up_11", "up_25", "up_38", "up_41", "up_45", "up_46"]


def _load():
    items = {it["id"]: it for it in json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
    outputs = json.loads((_DIR / SOURCE).read_text(encoding="utf-8"))["outputs"]
    return items, outputs


# 2026-11-06 팀원 합의 기준. 같은 문장을 판정기 프롬프트(requirement_judge._SYSTEM, req-v2)에도 넣었다 —
# 사람과 판정기가 다른 기준을 보면 일치도가 '기준 차이'를 재게 된다.
_GUIDE = [
    "사용자 요청만 본다. 요청이 명시적으로 요구한 문체·길이만 평가한다(요구가 없으면 보지 않는다).",
    "결과물에 실제로 있을 때만 '예'. 애매하거나 일부만 있으면 '아니오'.",
    "분량·줄 수를 묻는 질문은 머리말('다음은 ~입니다')과 맺음말 한 줄을 빼고 센다.",
    "글자 수는 공백 포함으로 센다. 줄 수는 엔터(줄바꿈) 기준 — 화면 폭에 따라 접혀 보이는 자동 줄바꿈은 세지 않는다.",
    "한 항목에 서로 모순되는 값이 둘 이상 있으면 '아니오'(예: 제출일이 '9월 22일'과 '9월 21일'로 함께 적힘).",
    "⟦자리표시자⟧·[회사명] 같은 빈칸이 질문이 묻는 내용 자리에 있으면 '아니오'.",
    "'(조건이 해당 없으면 해당없음)'이 붙은 질문만 '해당없음'을 쓸 수 있다. 그 밖에는 예/아니오 중 하나를 고른다.",
    "각 문항 맨 끝 x1 은 '요청에 없던 걸 덧붙여 틀렸나'를 따로 묻는다 — 요청 충족 여부와 섞지 않는다.",
    "모든 질문에 답한다. 빈 칸이 있으면 일치도를 계산하지 않는다.",
    "헷갈렸으면 같은 줄 오른쪽 메모 칸에 이유를 적는다 — 그 질문이 모호하다는 신호로 쓴다.",
]
# 2026-11-09 팀원 지적 ③: 요구사항 질문은 '요청한 것이 있나'만 묻는다. AI 가 **덧붙인** 틀린 정보
# (up_01 의 '7월 15일 (금)' — 2026-07-15 는 수요일)는 어느 질문에도 걸리지 않는다.
# 문항마다 한 줄 더 묻고, 충족률과 섞지 않고 따로 집계한다(주 지표 정의를 건드리지 않는다).
EXTRA = [("x1", "요청에 없던 내용을 덧붙였고, 그게 사실과 다르거나 근거가 없다"
                " (예: 요청에 없던 요일·수치·성능 주장). 덧붙인 게 없거나 전부 맞으면 '아니오'")]
_KIND = {"transform": "가공(주어진 글을 고침)", "generate": "생성(새로 씀)"}
_HDR = ["질문번호", "질문", "답(예/아니오)", "메모"]
_W = (2.0, 9.0, 3.0, 3.5)          # cm — 답 칸은 바로 타이핑할 수 있게 넉넉히


def _grid(doc, rows, cols):
    t = doc.add_table(rows=rows, cols=cols)
    t.style = "Table Grid"
    return t


def _keep_together(t):
    """질문표가 페이지 경계에서 쪼개지지 않게 한 덩어리로 묶는다(2026-11-09 팀원 지적 ④).
    행 안쪽 분할 금지(cantSplit)만으로는 **행과 행 사이**가 갈린다 — 마지막 행을 뺀 모든 문단에
    keep_with_next 를 줘야 표 전체가 함께 넘어간다. 한 페이지에 못 들어가면 Word 가 알아서 쪼갠다."""
    from docx.oxml import OxmlElement

    last = len(t.rows) - 1
    for i, row in enumerate(t.rows):
        pr = row._tr.get_or_add_trPr()
        pr.append(OxmlElement("w:cantSplit"))
        if i == 0:
            pr.append(OxmlElement("w:tblHeader"))      # 넘어가도 머리글은 되풀이
        if i < last:
            for c in row.cells:
                for p in c.paragraphs:
                    p.paragraph_format.keep_with_next = True


def _block(doc, text):
    """요청·결과물을 **줄 그대로** 들여쓴 문단으로 넣는다 — '본문이 3줄인가' 같은 질문이 줄바꿈에 걸려 있다.
    표로 감싸지 않는다: 85줄(up_02)처럼 한 페이지를 넘는 결과물은 상자가 중간에 잘려 보인다(지적 ④).
    고정폭 글꼴로 쓴다 — 마크다운 기호(**, |, #)가 꾸밈이 아니라 결과물 원본 글자임을 보이게."""
    from docx.shared import Cm, Pt

    for line in text.rstrip().split("\n"):
        para = doc.add_paragraph()
        run = para.add_run(line)
        run.font.name = "Consolas"     # 한글은 기본 글꼴로 대체된다 — 기호·숫자만 고정폭이면 충분
        run.font.size = Pt(9.5)
        para.paragraph_format.left_indent = Cm(0.5)    # 시트 자체 문구와 구분
        para.paragraph_format.space_after = Pt(0)


def build() -> None:
    from docx import Document
    from docx.shared import Cm

    items, outputs = _load()
    _OUT.mkdir(exist_ok=True)
    for old in ("outputs.md", "sheet_A.csv", "sheet_B.csv", "sheet_A.md", "sheet_B.md"):
        (_OUT / old).unlink(missing_ok=True)      # 질문·답이 떨어져 있던 옛 양식 — 잘못 채우는 일 방지

    n_q = sum(len(build_questions(items[i])) for i in SAMPLE) + len(SAMPLE) * len(EXTRA)
    for who in ("A", "B"):
        doc = Document()
        doc.add_heading(f"라벨링 시트 (사람 {who}) — 결과물 {len(SAMPLE)}건 · 질문 {n_q}개", 0)
        for line in (f"결과물을 하나씩 읽고, 바로 아래 표의 '답' 칸에 '예' 또는 '아니오'를 적어 주세요.",
                     "요청·결과물·질문·답이 이 파일 하나에 다 있습니다. 다른 파일은 보지 않아도 됩니다.",
                     "결과물 칸의 **·|·# 같은 기호는 AI 가 실제로 출력한 글자입니다(원본 그대로 두었습니다). "
                     "꾸밈이 아니라 글자로 보고 판정해 주세요.",
                     f"사람 A·B 가 서로 보지 않고 각자 자기 파일을 채웁니다. 한 사람당 약 1시간.",
                     "다 채우면 파일을 그대로 저장해 담당자에게 주세요(파일 이름은 바꾸지 마세요)."):
            doc.add_paragraph(line)

        doc.add_heading("답할 때 기준", level=1)
        for g in _GUIDE:
            doc.add_paragraph(g, style="List Bullet")

        doc.add_heading("목차", level=1)
        toc = _grid(doc, 1, 5)
        for c, txt in zip(toc.rows[0].cells, ("#", "문항", "유형", "분류", "질문 수")):
            c.paragraphs[0].add_run(txt).bold = True
        for n, iid in enumerate(SAMPLE, 1):
            it = items[iid]
            vals = (str(n), iid, _KIND[it["task_type"]].split("(")[0], it["category"],
                    str(len(build_questions(it)) + len(EXTRA)))
            for c, txt in zip(toc.add_row().cells, vals):
                c.text = txt

        for n, iid in enumerate(SAMPLE, 1):
            it, out = items[iid], outputs[iid]["output"]
            qs = build_questions(it)
            doc.add_page_break()                   # 문항 하나가 한 장에서 시작하게 — 두 문항이 섞이지 않는다
            doc.add_heading(f"{n} / {len(SAMPLE)}. {iid}", level=1)
            doc.add_paragraph(f"{_KIND[it['task_type']]} · {it['category']} · 질문 {len(qs) + len(EXTRA)}개")

            for title, text in (("사용자 요청", it["query"]), ("AI 결과물", out)):
                h = doc.add_heading(title, level=2)
                h.paragraph_format.keep_with_next = True   # 제목만 장 끝에 남지 않게(지적 ④)
                _block(doc, text)

            doc.add_heading("질문과 답", level=2).paragraph_format.keep_with_next = True
            t = _grid(doc, 1, 4)
            for c, txt in zip(t.rows[0].cells, _HDR):
                c.paragraphs[0].add_run(txt).bold = True
            rows = [(q["id"], q["text"] + (" (조건이 해당 없으면 '해당없음')" if q["conditional"] else ""))
                    for q in qs] + EXTRA
            for qid, text in rows:
                cells = t.add_row().cells
                cells[0].text = qid
                cells[1].text = text
            _keep_together(t)
            for row in t.rows:                     # 셀마다 지정해야 Word 가 폭을 지킨다
                for c, w in zip(row.cells, _W):
                    c.width = Cm(w)

        doc.save(_OUT / f"sheet_{who}.docx")

    print(f"결과물 {len(SAMPLE)}건 · 질문 {n_q}개")
    for who in ("A", "B"):
        print(f"  {_OUT/f'sheet_{who}.docx'}  ← 사람 {who} 가 읽고 답까지 적는 파일(서로 보지 말 것)")


def judge() -> None:
    """사람 답과 비교할 판정. **본 측정(uplift_score)과 같은 백엔드·모델**로 받는다 — 다른 판정기를
    검증해 놓고 그 κ 로 본 측정 수치를 믿을 수는 없다(2026-11-11 Gemini 경로 추가 때 맞춤)."""
    from dotenv import load_dotenv
    from eval.defect_canary import call_patiently
    from eval.requirement_judge import judge_requirements
    from eval.uplift_eval import _pick_backend
    from eval.uplift_score import _client, default_models
    load_dotenv()
    backend = _pick_backend()
    model = default_models(backend)[1]
    client = _client(backend)
    items, outputs = _load()
    path = _OUT / "judge.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if data and data.get("_model") != model:
        raise SystemExit(f"judge.json 은 {data.get('_model')} 판정이다. 지금 판정기는 {model} — "
                         "섞으면 안 되니 파일을 옮기거나 지운 뒤 다시 돌리세요.")
    data["_model"] = model
    print(f"판정기: {backend} · {model}")
    for iid in SAMPLE:
        if iid in data:
            continue
        r = call_patiently(lambda: judge_requirements(client, model, items[iid], outputs[iid]["output"]), 6 * 3600)
        data[iid] = {q: a["verdict"] for q, a in r["answers"].items()}
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{iid}: {data[iid]}", flush=True)


_KO = {"예": "yes", "아니오": "no", "아니요": "no", "해당없음": "na", "yes": "yes", "no": "no", "na": "na"}


_HEAD = re.compile(r"^\d+\s*/\s*\d+\.\s*(\S+)$")


def _blocks(doc):
    """문서 순서대로 문단·표를 돌려준다 — 어느 문항의 표인지는 바로 위 제목으로만 알 수 있다."""
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, doc)
        elif child.tag.endswith("}tbl"):
            yield Table(child, doc)


def _expected() -> dict:
    """{(문항, 질문번호): 조건부인가} — 평가셋이 정답. 시트에 없는 질문·허용 안 된 '해당없음'을 걸러낸다."""
    items, _ = _load()
    exp = {(iid, q["id"]): q["conditional"] for iid in SAMPLE for q in build_questions(items[iid])}
    exp.update({(iid, x[0]): False for iid in SAMPLE for x in EXTRA})   # 덧붙인 사실 오류 — 예/아니오만
    return exp


def _classes() -> dict:
    """{(문항, 질문번호): 분류} — κ 를 분류별로 따로 낸다. 섞어서 한 숫자로 내면
    주관 질문(쉬운 말·톤)의 낮은 일치도가 객관 질문의 일치도를 끌어내려 '질문이 모호하다'로 오해된다."""
    items, _ = _load()
    return {(iid, q["id"]):
            ("요구사항(주관)" if q["subjective"] else "요구사항(객관)") if q["kind"] == "requirement" else "정확성(gold)"
            for iid in SAMPLE for q in build_questions(items[iid])}


def _read_sheet(path: Path, expected: dict | None = None) -> dict:
    """채워진 시트(.docx) → {(문항, 질문번호): yes|no|na}.
    오입력·허용 안 된 '해당없음'은 즉시 알려준다(2026-11-06 팀원 지적 ③) — κ 가 조용히 틀리지 않게."""
    from docx import Document
    from docx.table import Table
    expected = _expected() if expected is None else expected
    doc = Document(path)
    out, iid, bad = {}, None, []
    for block in _blocks(doc):
        if not isinstance(block, Table):
            m = _HEAD.match(block.text.strip())
            if m:
                iid = m.group(1)
            continue
        if [c.text.strip() for c in block.rows[0].cells] != _HDR or iid is None:
            continue                      # 목차 표 등
        for row in block.rows[1:]:
            qid, ans = row.cells[0].text.strip(), row.cells[2].text.strip()
            if not ans:
                continue
            key = (iid, qid)
            if ans not in _KO:
                bad.append(f"{iid} {qid}: '{ans}' — 예/아니오/해당없음 중 하나로")
            elif key not in expected:
                bad.append(f"{iid} {qid}: 평가셋에 없는 질문(시트가 낡았다 — build 로 다시 만들 것)")
            elif _KO[ans] == "na" and not expected[key]:
                bad.append(f"{iid} {qid}: 조건부 질문이 아닌데 '해당없음'")
            else:
                out[key] = _KO[ans]
    if bad:
        raise SystemExit(f"{path.name} 를 읽을 수 없습니다 ({len(bad)}건):\n  - " + "\n  - ".join(bad))
    return out


def _stats(x: list[str], y: list[str]) -> str:
    """일치율 · κ · AC1 — 합격 기준은 AC1(쏠린 답에서 κ 가 0 으로 무너진다, 2026-11-12)."""
    f = lambda v: "정의 안 됨" if v is None else f"{v:.2f}"
    return (f"일치 {sum(p == q for p, q in zip(x, y)) / len(x):.1%} · κ={f(cohen_kappa(x, y))}"
            f" · AC1={f(gwet_ac1(x, y))}")


def agree(partial: bool = False) -> None:
    exp = _expected()
    a, b = (_read_sheet(_OUT / f"sheet_{who}.docx", exp) for who in ("A", "B"))
    for who, sheet in (("A", a), ("B", b)):
        miss = [k for k in exp if k not in sheet]
        if not miss:
            continue
        if not partial:      # 미완성 답안을 집계하면 '얼마나 일치했나'가 '어디까지 채웠나'에 좌우된다(팀원 지적 ③)
            raise SystemExit(f"사람 {who} 시트에 답이 빠진 질문 {len(miss)}/{len(exp)}개: "
                             + ", ".join(f"{i} {q}" for i, q in miss[:5]) + (" …" if len(miss) > 5 else "")
                             + "\n  다 채운 뒤 다시 돌리세요. 중간 확인이면 --partial 을 붙이세요.")
        print(f"  ⚠️ 사람 {who} 미응답 {len(miss)}/{len(exp)}개 — 채워진 것만으로 집계(중간 확인용)")
    jdata = json.loads((_OUT / "judge.json").read_text(encoding="utf-8"))
    print(f"판정기: {jdata.get('_model', '모델 기록 없음')} — 본 측정과 같은 모델이어야 이 κ 가 의미 있다")
    j = {(i, q): v for i, d in jdata.items() if not i.startswith("_") for q, v in d.items()}
    xids = {x[0] for x in EXTRA}
    extra = [k for k in a if k in b and k[1] in xids]      # 요구사항 충족률과 섞지 않는다
    keys = [k for k in a if k in b and k[1] not in xids]
    if not keys:
        raise SystemExit("두 시트에 함께 채워진 답이 없습니다.")
    pa, pb = [a[k] for k in keys], [b[k] for k in keys]
    print(f"사람이 함께 답한 질문 {len(keys)}개 (해당없음 A {sum(v == 'na' for v in a.values())}"
          f" · B {sum(v == 'na' for v in b.values())}개 — 일치도에서는 제3의 값으로 세고, 충족률 분모에서는 뺀다)")
    print(f"  사람 A·B {_stats(pa, pb)}")
    cls = _classes()
    for label in ("요구사항(객관)", "요구사항(주관)", "정확성(gold)"):
        ks = [k for k in keys if cls[k] == label]
        if not ks:
            continue
        line = f"  · {label} {len(ks)}개: A·B {_stats([a[k] for k in ks], [b[k] for k in ks])}"
        kj = [k for k in ks if k in j]
        if kj:
            line += (f"\n      판정기 대 A {_stats([a[k] for k in kj], [j[k] for k in kj])}"
                     f"\n      판정기 대 B {_stats([b[k] for k in kj], [j[k] for k in kj])}")
        print(line)
    if extra:
        both = [k for k in extra if a[k] == b[k] == "yes"]
        print(f"  덧붙인 사실 오류 문항: 일치 {sum(a[k] == b[k] for k in extra) / len(extra):.1%}"
              f" · 두 사람 모두 '예' {len(both)}건" + (" → " + ", ".join(k[0] for k in both) if both else ""))
    both = [k for k in keys if a[k] == b[k] and k in j]
    if both:
        hit = sum(j[k] == a[k] for k in both)
        print(f"  두 사람이 같게 답한 {len(both)}개 기준 판정기 일치 {hit / len(both):.1%}")
        for k in both:
            if j[k] != a[k]:
                print(f"    ✗ {k[0]} {k[1]}: 사람 {a[k]} / 판정기 {j[k]}")
    for who, p in (("A", a), ("B", b)):
        kk = [k for k in keys if k in j]
        print(f"  사람 {who} 대 판정기 {_stats([p[k] for k in kk], [j[k] for k in kk])}")


def main():
    ap = argparse.ArgumentParser(description="사람 대조 라벨링 시트 생성·일치도 계산")
    ap.add_argument("command", choices=["build", "judge", "agree"])
    ap.add_argument("--partial", action="store_true",
                    help="agree: 답이 빠진 질문이 있어도 채워진 것만으로 집계(중간 확인용)")
    args = ap.parse_args()
    {"build": build, "judge": judge, "agree": lambda: agree(args.partial)}[args.command]()


if __name__ == "__main__":
    main()
