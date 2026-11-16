"""
eval/review_materials.py
────────────────────────────────────────────────────────────
eval/HUMAN_REVIEW.md 2~4번 작업에 쓰는 사람용 자료(docx)를 만든다. 1번(κ 시트)은 eval/human_review.py.

    python3 -m eval.review_materials        # eval/human_review/ 에 아래 네 파일 생성

  boundary_A.docx · boundary_B.docx  2번 경계 사례 결함 5건 — 두 사람이 각자
  label_review.docx                  3번 평가셋 라벨 검토 — 트랙 A 31문항 먼저, 트랙 B 17문항 뒤
  trackB_requests.docx               4번 트랙 B 요청 8개 새로 쓰기 — 딸깍 결과를 본 적 없는 팀원이

읽어 들이는 코드는 없다. 2번은 5건뿐이라 눈으로 맞춰 보고, 3·4번은 사람이 고친 내용을
평가셋(uplift_set_v2.json)에 옮겨 적는 일이라 자동화할 게 없다.
"""

import json
import re
from pathlib import Path

from eval.human_review import _OUT, _block, _grid, _keep_together

_DIR = Path(__file__).parent

# 2번 — '볼 곳'은 바뀐 부분만 중립적으로 적는다. 지금 라벨·판정기 결과를 보여 주면 거기에 끌려간다.
BOUNDARY = [
    ("up_15", "fabrication", "결과물이 '한국은행'이라고 적었다 — 원문은 '중앙은행'"),
    ("up_16", "fabrication", "결과물에 '오늘 중으로'가 있다 — 원문에는 시점이 없다"),
    ("up_04", "fabrication", "결과물이 '일정 확정'이라고 적었다 — 원문은 '일정 논의'"),
    ("up_47", "fabrication", "결과물이 '새로 입사한'이라고 적었다 — 원문은 '새로 들어온'"),
    ("up_45", "refusal", "결과물이 정보를 먼저 되묻고 빈칸 템플릿을 준다 (다른 모델 Qwen 의 결과물)"),
]
_ASK = {"fabrication": "이것은 '지어내기'인가?", "refusal": "이것은 '거부'인가?"}


def _plain(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text)


def _answer_table(doc, header, rows, widths):
    from docx.shared import Cm
    t = _grid(doc, 1, len(header))
    for c, txt in zip(t.rows[0].cells, header):
        c.paragraphs[0].add_run(txt).bold = True
    for vals in rows:
        for c, txt in zip(t.add_row().cells, vals):
            c.text = txt
    _keep_together(t)
    for row in t.rows:
        for c, w in zip(row.cells, widths):
            c.width = Cm(w)
    return t


def _heading(doc, text, level):
    doc.add_heading(text, level).paragraph_format.keep_with_next = True


def build_boundary(items: dict, defects: dict) -> None:
    from docx import Document
    holdout = {c["item"]: c for c in json.loads((_DIR / "defect_holdout2_set.json").read_text(encoding="utf-8"))["cases"]}
    qwen = json.loads((_DIR / "fresh_outputs_qwen_20260920.json").read_text(encoding="utf-8"))["outputs"]
    for who in ("A", "B"):
        doc = Document()
        doc.add_heading(f"경계 사례 결함 판단 (사람 {who}) — 5건 · 약 10분", 0)
        for line in ("판정기가 결함을 '놓쳤다'고 기록된 사례들인데, 애초 라벨이 너무 엄격했을 수 있습니다.",
                     "사람이 결함으로 보면 판정기의 약점이고, 사람도 결함이 아니라고 보면 라벨을 고칩니다.",
                     "사람 A·B 가 서로 보지 않고 각자 답합니다. 각 사례 아래 표에 예/아니오와 이유 한 줄을 적어 주세요."):
            doc.add_paragraph(line)
        _heading(doc, "결함 정의 (판정기가 받는 것과 같은 문장)", 1)
        doc.add_paragraph("지어내기 — " + _plain(defects["fabrication"]["transform"]["text"]), style="List Bullet")
        doc.add_paragraph("거부 — " + _plain(defects["refusal"]["text"]), style="List Bullet")
        for n, (iid, kind, where) in enumerate(BOUNDARY, 1):
            query = items[iid]["query"]
            output = qwen[iid]["output"] if iid == "up_45" else holdout[iid]["output"]
            doc.add_page_break()
            _heading(doc, f"{n} / {len(BOUNDARY)}. {iid}", 1)
            _heading(doc, "사용자 요청(원문 포함)", 2)
            _block(doc, query)
            _heading(doc, "AI 결과물", 2)
            _block(doc, output)
            _heading(doc, "볼 곳", 2)
            doc.add_paragraph(where)
            _answer_table(doc, ["사례", "질문", "답(예/아니오)", "이유(한 줄)"],
                          [(iid, _ASK[kind], "", "")], (2.0, 5.5, 3.0, 7.0))
        doc.save(_OUT / f"boundary_{who}.docx")


def _check_text(c: dict) -> str:
    vals = c.get("any") or c.get("all") or c.get("n") or c.get("value")
    vals = " / ".join(map(str, vals)) if isinstance(vals, list) else {"ko": "한국어", "en": "영어"}.get(vals, vals)
    how = {"contains_any": " — 하나 이상 들어 있다", "contains_all": " — 모두 들어 있다",
           "max_chars": "자 이하(본문)", "has_table": "표가 있다", "has_code_block": "코드 블록이 있다",
           "lang": "로 썼다"}.get(c["type"], c["type"])
    basis = {"preserve": "요청에 준 값을 지켰나", "request": "요청한 형식·조건", "gold": "정답 요소"}
    return f"{vals or ''}{how}" + f"  [{basis.get(c.get('basis'), c.get('basis', '-'))}]"


def build_label_review(items_all: list[dict]) -> None:
    from docx import Document
    doc = Document()
    doc.add_heading(f"평가셋 라벨 검토 — {len(items_all)}문항 (트랙 A 먼저)", 0)
    for line in ("각 문항의 '요청'만 보고, 아래 라벨이 맞는지 판단합니다. AI 결과물은 일부러 넣지 않았습니다 — "
                 "라벨은 결과물이 아니라 요청에서 나와야 합니다.",
                 "판단 칸: 맞음 / 고침 / 빼기 중 하나. 고침·빼기면 오른쪽 칸에 이유나 고친 문장을 적습니다.",
                 "맨 아래 빈 줄에는 요청에 있는데 라벨에서 빠진 조건을 적습니다(없으면 비워 둠).",
                 "특히 볼 것: ① '주관' 표시가 맞는가(사람마다 갈리는 항목만 주관 — 주 지표에서 빠진다) "
                 "② '조건부' 표시가 맞는가(조건이 안 맞으면 '해당없음'이 가능한 항목) "
                 "③ 요청에 없는 조건을 라벨이 요구하지 않는가.",
                 "트랙 A = 조건을 충분히 준 요청('망치지 않는가'를 봄), 트랙 B = 조건이 부족한 요청('도움이 되는가'를 봄)."):
        doc.add_paragraph(line)
    ordered = [it for it in items_all if it["track"] == "A"] + [it for it in items_all if it["track"] == "B"]
    for n, it in enumerate(ordered, 1):
        doc.add_page_break()
        _heading(doc, f"{n} / {len(ordered)}. {it['id']} — 트랙 {it['track']}", 1)
        doc.add_paragraph(f"{it['task_type']} · {it['category']} · 구체성 {it.get('specificity', '-')}"
                          + (" · 요청 속 사실값을 지어내는지 코드로 봄(entity_facts)" if it.get("entity_facts") else ""))
        _heading(doc, "사용자 요청", 2)
        _block(doc, it["query"])
        rows = [(f"r{i}", r["text"], "주관" if r.get("subjective") else "", "", "")
                for i, r in enumerate(it.get("requirements", []), 1)]
        rows += [(f"g{i}", g["text"], "조건부" if g.get("conditional") else "정답", "", "")
                 for i, g in enumerate(it.get("gold", []), 1)]
        rows += [(f"c{i}", _check_text(c), "코드 판정", "", "") for i, c in enumerate(it.get("checks", []), 1)]
        rows += [("+", "(빠진 조건이 있으면 여기에)", "", "", "")]
        _heading(doc, "라벨", 2)
        _answer_table(doc, ["번호", "라벨", "표시", "판단", "고칠 내용·이유"], rows, (1.3, 8.0, 1.8, 1.8, 4.6))
    doc.save(_OUT / "label_review.docx")


def build_track_b_requests(items: dict) -> None:
    from docx import Document
    doc = Document()
    doc.add_heading("트랙 B 요청 8개 새로 쓰기", 0)
    for line in ("지금 트랙 B 의 up_41~up_48 은 평가 도구를 만든 쪽(Claude)이 지어낸 요청입니다. "
                 "딸깍에 유리하게 기울었을 수 있어서, 실제 사용자처럼 쓴 요청으로 바꿉니다.",
                 "쓰는 사람: 딸깍 결과물을 본 적 없는 팀원. 다 쓰기 전에는 딸깍에 넣어 보지 마세요.",
                 "평소 ChatGPT 에 던지듯 짧게 씁니다. 예: '○○ 공지 써줘', '○○ 메일 써줘' 처럼 한 줄 수준. "
                 "일부러 조건을 많이 붙이지 않습니다 — 조건이 부족한 요청이 트랙 B 의 정의입니다.",
                 "'고치기' 칸은 고칠 글을 요청에 함께 붙여 주세요(예: 이거 다듬어줘: '…').",
                 "종류는 지금 세트의 비율을 맞추기 위한 참고입니다. 더 자연스러운 요청이 떠오르면 종류를 바꿔도 됩니다(메모에 표시).",
                 "다 쓰면 담당자에게 주세요. 담당자가 요구사항 라벨을 붙이고, 기존 평가셋과 겹치는지는 테스트가 막습니다."):
        doc.add_paragraph(line)
    kind = {"generate": "새로 쓰기", "transform": "고치기"}
    rows = [(str(n - 40), f"{kind[items[f'up_{n}']['task_type']]} · {items[f'up_{n}']['category']}", "", "")
            for n in range(41, 49)]
    _answer_table(doc, ["#", "종류(참고)", "요청(여기에 쓰기)", "메모"], rows, (1.0, 4.0, 9.0, 3.5))
    doc.save(_OUT / "trackB_requests.docx")


def main() -> None:
    data = json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))
    items = {it["id"]: it for it in data["items"]}
    _OUT.mkdir(exist_ok=True)
    build_boundary(items, data["defects"])
    build_label_review(data["items"])
    build_track_b_requests(items)
    for name in ("boundary_A.docx", "boundary_B.docx", "label_review.docx", "trackB_requests.docx"):
        print(f"  {_OUT / name}")


if __name__ == "__main__":
    main()
