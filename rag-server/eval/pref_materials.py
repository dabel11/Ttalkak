"""
eval/pref_materials.py
────────────────────────────────────────────────────────────
트랙 B 짝 비교를 사람이 다시 고르는 자료(docx) — 판정기의 '긴 답 선호' 편향과 진짜 완성도를 가르기 위해.

    python3 -m eval.pref_materials eval/results/uplift_trackB_v7_20261114.json

  pref_A.docx · pref_B.docx   사람 A·B 가 각자 — 출처를 모른 채 결과물마다 A~E(해냈나·바로 쓰나·빠짐·군더더기·틀림)
                              를 답하고, 비교 F~I(긴 쪽 추가분의 쓸모·선택·확신·이유)를 답한다(순서 무작위)
  pref_key.json               정답지(어느 쪽이 딸깍인지, 판정기 결론) — 사람에게 주지 않는다

판정기가 딸깍 승으로 본 쌍 5개 + raw 승으로 본 쌍 5개(서로 다른 문항, 시드 고정).
사람 답이 판정기와 같은 쪽이면 길이 차이는 완성도로 볼 수 있고, 다르면 판정기 편향을 의심한다.
"""

import json
import random
import sys
from pathlib import Path

from eval.human_review import _OUT, _block
from eval.review_materials import _answer_table, _heading

_DIR = Path(__file__).parent
N_EACH = 5


def pick(data: dict, seed: int = 20261114) -> list[dict]:
    rng = random.Random(seed)
    by = {"b": [], "a": []}                      # b = 딸깍 승, a = raw 승 (judge_pair 의 a=raw, b=ttalkak)
    for key, p in sorted(data["pairs"].items()):
        if "pair_raw_vs_ttalkak" in key and p["winner"] in by:
            by[p["winner"]].append(key)
    out = []
    for w in ("b", "a"):
        keys = by[w][:]
        rng.shuffle(keys)
        seen = set()
        for k in keys:
            iid, _, rep = k.split("|")
            if iid in seen:
                continue
            seen.add(iid)
            out.append({"item": iid, "rep": int(rep), "judge": "ttalkak" if w == "b" else "raw",
                        "ttalkak_first": rng.random() < 0.5})
            if len(seen) == N_EACH:
                break
    rng.shuffle(out)
    return out


# 결과물마다 따로 묻는다 — '어느 쪽이 나은가' 한 질문으로는 길이 때문인지 내용 때문인지 갈리지 않는다(2026-11-14 사용자 지적).
PER_OUTPUT = [
    ("A", "요청한 핵심 일을 해냈다 (엉뚱한 것을 하거나 요청을 바꿔 버리지 않았다)"),
    ("B", "요청자가 그대로 — 또는 이름·날짜 정도만 채워서 — 바로 쓸 수 있다"),
    ("C", "요청자에게 꼭 있어야 할 내용이 빠졌다 (예면 메모에 무엇이 빠졌는지)"),
    ("D", "요청자가 바라지 않았을 내용·분량이 붙어 있다: 군더더기, 요청 범위 밖 내용, 필요 이상 긴 설명"),
    ("E", "틀린 내용이나 지어낸 사실(없는 수치·이름·사건)이 있다"),
]
PAIR = [
    ("F", "더 긴 결과물에만 있는 내용은 요청자에게",
     "꼭 필요 / 있으면 좋음 / 없어도 됨 / 오히려 방해"),
    ("G", "요청자라면 실제로 어느 쪽을 쓰겠는가", "1 / 2 / 차이 없음"),
    ("H", "G 답을 얼마나 확신하는가", "확실 / 조금 / 모르겠음"),
    ("I", "G 를 고른 결정적 이유 한 줄", "(자유)"),
]
_GUIDE = (
    "같은 요청을 같은 AI 에 두 가지 방식으로 넣어 받은 결과물 두 개입니다. 어느 방식인지는 일부러 숨겼습니다.",
    "요청은 일부러 조건(대상·분량·말투 등)을 빼 둔 짧은 요청입니다. 이 요청을 보낸 사람이 되었다고 생각하고, "
    "그 사람이 원했을 법한 결과를 기준으로 봅니다. 그 기준이 애매하면 가장 흔한 상황(예: 사과문 → 고객에게 보내는 사과)을 떠올리세요.",
    "결과물마다 A~E 를 '예/아니오'로 먼저 답하고, 그다음 두 결과물을 비교해 F~I 를 답합니다. "
    "순서가 중요합니다 — 비교를 먼저 하면 A~E 가 그 답에 끌려갑니다.",
    "길이는 장점도 단점도 아닙니다. 긴 쪽에만 있는 내용이 요청자에게 실제로 쓸모 있는지(F)를 따로 묻는 이유입니다. "
    "글자 수는 F 를 답하기 쉽게 적어 두었습니다.",
    "⟦ ⟧ 나 [ ] 로 표시된 빈칸은 요청자가 나중에 채울 자리입니다. 빈칸이 있다는 것만으로 감점하지 말고, "
    "요청자가 채울 수 있는 정보(이름·날짜)인지, AI 가 채웠어야 할 내용인지를 B 에서 판단하세요.",
    "다른 사람과 상의하지 말고, 결과물을 다른 AI 에 물어보지 마세요. 1쌍에 3~4분, 전체 약 40분.",
)


def _fill(cell, text):
    cell.text = text


def build(result_path: str) -> list[dict]:
    from docx import Document
    data = json.loads(Path(result_path).read_text(encoding="utf-8"))
    items = {it["id"]: it for it in json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
    pairs = pick(data)
    R = data["records"]
    for p in pairs:
        t, r = R[f"{p['item']}|ttalkak|{p['rep']}"]["output"], R[f"{p['item']}|raw|{p['rep']}"]["output"]
        p["texts"] = (t, r) if p["ttalkak_first"] else (r, t)
        p["longer"] = 1 if len(p["texts"][0]) >= len(p["texts"][1]) else 2
    for who in ("A", "B"):
        doc = Document()
        doc.add_heading(f"결과물 비교 평가 (평가자 {who}) — {len(pairs)}쌍", 0)
        for line in _GUIDE:
            doc.add_paragraph(line)
        _heading(doc, "질문 목록", 1)
        _answer_table(doc, ["", "결과물마다 (예/아니오)"], PER_OUTPUT, (1.0, 16.5))
        doc.add_paragraph()
        _answer_table(doc, ["", "두 결과물 비교", "답할 수 있는 값"], PAIR, (1.0, 9.0, 7.5))
        for n, p in enumerate(pairs, 1):
            first, second = p["texts"]
            doc.add_page_break()
            _heading(doc, f"{n} / {len(pairs)}", 1)
            _heading(doc, "요청", 2)
            _block(doc, items[p["item"]]["query"])
            for k, txt in ((1, first), (2, second)):
                _heading(doc, f"결과물 {k}  ({len(txt):,}자)", 2)
                _block(doc, txt)
            _heading(doc, f"{n}번 답", 2)
            _answer_table(doc, ["", "질문", "결과물 1", "결과물 2", "메모"],
                          [(q, txt, "", "", "") for q, txt in PER_OUTPUT], (0.8, 8.2, 2.0, 2.0, 4.5))
            doc.add_paragraph()
            _answer_table(doc, ["", "질문", "답", "메모"],
                          [(q, txt.replace("더 긴 결과물", f"더 긴 결과물(결과물 {p['longer']})") + f"  [{opts}]", "", "")
                           for q, txt, opts in PAIR], (0.8, 9.7, 3.0, 4.0))
        doc.save(_OUT / f"pref_{who}.docx")
    key = [{"n": n, **{k: v for k, v in p.items() if k != "texts"}} for n, p in enumerate(pairs, 1)]
    (_OUT / "pref_key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    return key


def read_answers(path) -> dict:
    """채운 pref_*.docx → {쌍 번호: {'A': (결과물1, 결과물2), …, 'G': 답, 'I': 이유}}.
    답표는 쌍마다 결과물 표(5열) 다음 비교 표(4열) 순서로 나온다 — 맨 앞 질문 목록 표 2개는 건너뛴다."""
    from docx import Document
    tables = Document(str(path)).tables[2:]
    out = {}
    for n, i in enumerate(range(0, len(tables), 2), 1):
        per, pair = tables[i], tables[i + 1]
        ans = {r.cells[0].text.strip(): (r.cells[2].text.strip(), r.cells[3].text.strip()) for r in per.rows[1:]}
        ans |= {r.cells[0].text.strip(): r.cells[2].text.strip() for r in pair.rows[1:]}
        out[n] = ans
    return out


if __name__ == "__main__":
    k = build(sys.argv[1] if len(sys.argv) > 1 else "eval/results/uplift_trackB_v7_20261114.json")
    print(f"{len(k)}쌍 — {_OUT}/pref_A.docx · pref_B.docx · pref_key.json(정답지, 사람에게 주지 말 것)")
