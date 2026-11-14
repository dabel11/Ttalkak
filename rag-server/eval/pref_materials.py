"""
eval/pref_materials.py
────────────────────────────────────────────────────────────
사람 선호 평가지(docx) — 판정기 결론을 사람으로 확인하고, **다음에 무엇을 고칠지**를 정하는 자료.
질문 하나하나가 확인할 가설과 그 결과로 바뀌는 개선 조치에 묶여 있다(아래 HYPOTHESES · pref_guide.docx).

    python3 -m eval.pref_materials

  pref_A.docx · pref_B.docx   평가자 A·B 가 각자 — 출처를 모른 채(순서 무작위) 결과물마다 P1~P7, 비교 C1~C5
  pref_guide.docx             설계서(질문 ↔ 가설 ↔ 개선 조치 ↔ 판단 규칙) — 평가자에게 주지 않는다(가설이 답을 끌어간다)
  pref_key.json               정답지(어느 쪽이 딸깍인지, 판정기 결론, 요청 유형) — 평가자에게 주지 않는다

비교 대상은 결론으로 쓰는 **빈칸 채움 공정 비교(②)** 다: 빈칸이 있던 쌍은 '딸깍(빈칸 채움) vs 원래 요청 + 같은 정보',
없던 쌍은 v7 그대로. 10쌍 = 판정기 딸깍 승 5 + 원래 요청 승 5, 요청 유형별 할당(STRATA), 서로 다른 요청, 시드 고정.
지금까지 지는 원인으로 본 '원문 딸린 간단한 요청'(up_14·up_36)은 반드시 넣는다(H2 를 직접 확인).
"""

import json
import random
from pathlib import Path

from eval.human_review import _OUT, _block
from eval.review_materials import _answer_table, _heading

_DIR = Path(__file__).parent
SRC = _DIR / "results/uplift_trackB_v7_20261114.json"
FILL = _DIR / "results/uplift_trackB_v7_filled_20261114.json"
SEED = 20261114

# 요청 유형 — 가설을 유형별로 읽기 위해(H2 는 '원문 딸린 요청'에서만 의미가 있다)
TYPE = {"교정·재작성": "원문 다듬기·변환", "디버깅": "원문 다듬기·변환", "코드 리뷰": "코드",
        "코드 작성": "코드", "추천·아이디어": "추천·계획", "계획·일정": "추천·계획"}
_type = lambda it: TYPE.get(it["category"], "짧은 창작·공지")
# (판정기 결론, 유형) → 뽑을 쌍 수. 합계 판정기 원래 요청 승 5 · 딸깍 승 5
STRATA = {("raw", "원문 다듬기·변환"): 2, ("raw", "짧은 창작·공지"): 2, ("raw", "추천·계획"): 1,
          ("ttalkak", "원문 다듬기·변환"): 1, ("ttalkak", "코드"): 1, ("ttalkak", "짧은 창작·공지"): 2,
          ("ttalkak", "추천·계획"): 1}
MUST = ("up_14", "up_36")

# ── 질문 ─────────────────────────────────────────────────────
# (번호, 무엇을 보나, 질문, 답할 수 있는 값)
PER_OUTPUT = [
    ("P1", "의도", "요청자가 원한 결과물의 종류와 범위를 만들었는가?",
     "1 엉뚱한 것 · 2 · 3 대체로 맞지만 범위가 다름 · 4 · 5 정확히 그것"),
    ("P2", "바로 쓰기", "요청자가 이걸 받아 실제로 쓰기까지 얼마나 손봐야 하는가?",
     "A 그대로 씀 · B 이름·날짜 등 몇 군데만 채움 · C 일부 문단을 고치거나 지움 · D 대부분 다시 씀"),
    ("P3", "빠진 것", "이 요청이라면 당연히 있어야 하는데 빠진 요소가 있는가?",
     "없음 · 있음(메모에 무엇이 빠졌는지)"),
    ("P4", "군더더기", "요청자가 지울 부분(불필요한 설명·요청 밖 내용·중복)이 전체의 얼마인가?",
     "0% · 10% 안팎 · 30% 안팎 · 절반 이상"),
    ("P5", "빈칸", "요청자가 채워야 할 빈칸([ ] 등)이 쓰는 데 미치는 영향은?",
     "빈칸 없음 · 채우기 쉬움 · 무엇을 넣을지 고민됨 · 빈칸 때문에 못 씀"),
    ("P6", "정확성", "틀린 내용이나 지어낸 사실(없는 수치·이름·사건·기능)이 있는가?",
     "없음 · 사소함 · 그대로 쓰면 문제가 됨(메모에 위치)"),
    ("P7", "방향 선택", "요청자가 정하지 않은 방향(톤·용도·대상·방법)을 어떻게 다뤘고, 그게 맞았는가?",
     "하나로 정함-적절 · 하나로 정함-아쉬움 · 여러 버전 제시-도움 · 여러 버전 제시-불필요 · 해당 없음"),
]
PAIR = [
    ("C1", "길이의 가치", "더 긴 결과물({longer})에만 있는 내용은 요청자에게",
     "꼭 필요 · 있으면 좋음 · 없어도 됨 · 오히려 방해"),
    ("C2", "최종 선택", "요청자라면 실제로 어느 쪽을 쓰겠는가?", "1 · 2 · 동등"),
    ("C3", "확신", "C2 답을 얼마나 확신하는가?", "확실 · 조금 · 모르겠음"),
    ("C4", "결정 요인", "C2 를 가른 가장 큰 이유 하나는?",
     "가 의도에 더 맞음 · 나 빠진 것이 적음 · 다 군더더기가 적음 · 라 빈칸이 적어 바로 씀 · "
     "마 더 정확함 · 바 방향 선택이 적절 · 사 구성·읽기 쉬움 · 아 기타(메모)"),
    ("C5", "이상적인 결과물", "두 결과물 모두에 없지만 이 요청에 있었으면 하는 것은?", "(자유, 없으면 '없음')"),
]

# 설계서 — 질문 ↔ 가설 ↔ 개선 조치 ↔ 판단 규칙. 사람 답을 읽는 순서도 이 표를 따른다.
HYPOTHESES = [
    ("H1", "판정기가 긴 답을 선호한다(길이 편향)",
     "C1 · C2 · C3 · P4",
     "판정기가 더 긴 쪽을 고른 쌍에서 C1 이 '없어도 됨/방해'로 절반 이상이고, C2 가 판정기와 다르다",
     "판정기 수치를 사람 결과로 보정해 보고하고, 간결 규칙(v9)을 적용할 근거로 쓴다"),
    ("H2", "원문 딸린 간단한 요청에서 딸깍이 결과를 과하게 부풀린다",
     "P4 · P2 · C4(다)",
     "'원문 다듬기·변환' 쌍에서 딸깍 결과물의 P4 가 '30% 안팎' 이상이거나 C4 가 '다 군더더기가 적음'으로 원래 요청을 고른다",
     "SYSTEM_PROMPT 에 '원문이 주어진 간단한 요청은 결과를 늘리지 않는다' 범위를 좁혀 적용(v9) 후 소규모 재측정"),
    ("H3", "정하지 않은 방향을 여러 버전으로 덮는 것(v6 규칙)이 도움이 된다",
     "P7 · C4(바)",
     "딸깍 결과물의 P7 이 '여러 버전 제시-도움'이 '불필요'보다 많다",
     "많으면 규칙 유지, 적으면 '보통 3갈래 이상'을 '필요할 때만'으로 줄인다"),
    ("H4", "빈칸이 바로 쓰기를 막는다",
     "P5 · P2 · C4(라)",
     "P5 가 '고민됨/못 씀'인 결과물의 P2 가 C·D 로 몰린다",
     "빈칸 규칙(부수 정보는 빈칸 없이) 범위를 넓히거나, 빈칸에 예시 값을 함께 쓰게 한다"),
    ("H5", "딸깍이 사실을 지어내지 않는다",
     "P6",
     "딸깍 결과물의 P6 '문제가 됨'이 원래 요청보다 많지 않다",
     "많으면 사실 빈칸 규칙을 다시 강화하고 해당 사례를 A/B 시험에 넣는다"),
    ("H6", "원래 요청 문장을 두고 조건만 덧붙이는 구조(v7)가 의도를 지킨다",
     "P1",
     "딸깍 결과물의 P1 평균이 원래 요청보다 낮지 않다",
     "낮으면 덧붙인 조건이 의도를 바꾼 사례를 찾아 해당 조건 문구를 고친다"),
    ("H7", "전문가 기준(필수 요소·자체 점검)을 더하면 빠지는 것이 줄어든다",
     "P3 · C5 · C4(나)",
     "딸깍 결과물의 P3 '있음'이 원래 요청보다 적다. C5 에 반복해 나오는 요소가 있다",
     "C5·P3 메모에서 유형별로 반복되는 요소를 SYSTEM_PROMPT 의 '꼭 있어야 할 요소' 목록에 추가"),
    ("J", "판정기와 사람이 같은 쪽을 고른다(판정기 검증)",
     "C2 · C3",
     "확신 '확실/조금' 쌍에서 C2 가 판정기 결론과 같은 비율",
     "70% 이상이면 판정기 수치를 그대로 쓰고, 낮으면 어긋난 쌍의 C4 를 읽어 판정 기준을 점검"),
]

_GUIDE = (
    "같은 요청을 같은 AI 에 두 가지 방식으로 넣어 받은 결과물 두 개입니다. 어느 방식인지는 일부러 숨겼고 순서도 섞었습니다.",
    "요청은 일부러 조건(대상·분량·말투 등)을 빼 둔 짧은 요청입니다. '요청자가 알고 있는 정보'가 붙은 쌍은 두 결과물 모두 "
    "그 정보를 받고 만들어졌습니다. 이 요청을 보낸 사람이 되었다고 생각하고, 그 사람이 원했을 법한 결과를 기준으로 봅니다.",
    "순서가 중요합니다. ① 결과물 1·2 를 끝까지 읽고 ② 결과물마다 P1~P7 을 답한 뒤 ③ 비교 C1~C5 를 답합니다. "
    "비교를 먼저 하면 결과물별 답이 그쪽으로 끌려갑니다.",
    "길이는 장점도 단점도 아닙니다. 그래서 C1 에서 '긴 쪽에만 있는 내용'의 쓸모를 따로 묻습니다. 글자 수는 그 답을 돕기 위해 적었습니다.",
    "답 칸에는 보기 중 하나를 그대로 적습니다(예: '4', 'B', '30% 안팎', '가'). 애매하면 더 가까운 쪽을 고르고 메모에 이유를 적어 주세요.",
    "다른 사람과 상의하지 말고, 결과물을 다른 AI 에 물어보지 마세요. 1쌍에 4~5분, 전체 약 45분.",
)


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def candidates(src: dict, fill: dict, items: dict) -> list[dict]:
    """공정 비교(②) 기준의 모든 쌍 — 판정기 결론이 갈린 것만(비슷함 제외)."""
    out = []
    for key, p in sorted(src["pairs"].items()):
        if "pair_raw_vs_ttalkak" not in key:
            continue
        iid, _, rep = key.split("|")
        f = fill.get(f"{iid}|ttalkak|{rep}")
        winner = f["pair2_raw_facts"]["winner"] if f else p["winner"]
        if winner not in ("a", "b"):
            continue
        out.append({"item": iid, "rep": int(rep), "filled": bool(f), "type": _type(items[iid]),
                    "judge": "ttalkak" if winner == "b" else "raw"})
    return out


def pick(cands: list[dict], seed: int = SEED) -> list[dict]:
    rng = random.Random(seed)
    pool = cands[:]
    rng.shuffle(pool)
    # 꼭 넣을 요청(지는 쪽 결론으로)을 먼저 — sort 는 안정 정렬이라 같은 키 안에선 섞인 순서가 유지된다
    pool.sort(key=lambda c: (c["item"] not in MUST, c["judge"] != "raw"))
    need, seen, out = dict(STRATA), set(), []
    for c in pool:
        k = (c["judge"], c["type"])
        if need.get(k, 0) and c["item"] not in seen:
            need[k] -= 1
            seen.add(c["item"])
            out.append({**c, "ttalkak_first": rng.random() < 0.5})
    assert not any(need.values()), f"채우지 못한 칸: {need}"
    rng.shuffle(out)
    return out


def _texts(p: dict, src: dict, fill: dict, items: dict) -> tuple[str, str, str]:
    """(요청 표시문, 딸깍 결과물, 원래 요청 결과물)."""
    k = f"{p['item']}|ttalkak|{p['rep']}"
    if p["filled"]:
        f = fill[k]
        return f["raw_facts_query"], f["ttalkak_filled"]["output"], f["raw_facts"]["output"]
    R = src["records"]
    return items[p["item"]]["query"], R[k]["output"], R[f"{p['item']}|raw|{p['rep']}"]["output"]


def _sheet(who: str, pairs: list[dict]) -> None:
    from docx import Document
    doc = Document()
    doc.add_heading(f"결과물 비교 평가 (평가자 {who}) — {len(pairs)}쌍", 0)
    for line in _GUIDE:
        doc.add_paragraph(line)
    _heading(doc, "질문 목록", 1)
    _answer_table(doc, ["", "보는 것", "결과물마다 묻는 질문", "답할 수 있는 값"],
                  [(q, a, t, o) for q, a, t, o in PER_OUTPUT], (1.0, 2.0, 7.0, 7.5))
    doc.add_paragraph()
    _answer_table(doc, ["", "보는 것", "두 결과물을 비교하는 질문", "답할 수 있는 값"],
                  [(q, a, t.format(longer="결과물 1 또는 2"), o) for q, a, t, o in PAIR], (1.0, 2.0, 7.0, 7.5))
    for n, p in enumerate(pairs, 1):
        first, second = p["shown"]
        doc.add_page_break()
        _heading(doc, f"{n} / {len(pairs)}", 1)
        _heading(doc, "요청", 2)
        _block(doc, p["request"])
        for k, txt in ((1, first), (2, second)):
            _heading(doc, f"결과물 {k}  ({len(txt):,}자)", 2)
            _block(doc, txt)
        _heading(doc, f"{n}번 답 — 결과물마다", 2)
        _answer_table(doc, ["", "질문", "결과물 1", "결과물 2", "메모"],
                      [(q, f"[{a}] {t}\n({o})", "", "", "") for q, a, t, o in PER_OUTPUT], (0.9, 8.6, 1.9, 1.9, 4.2))
        doc.add_paragraph()
        _heading(doc, f"{n}번 답 — 비교", 2)
        longer = f"결과물 {p['longer']}"
        _answer_table(doc, ["", "질문", "답", "메모"],
                      [(q, f"[{a}] {t.format(longer=longer)}\n({o})", "", "") for q, a, t, o in PAIR], (0.9, 9.7, 2.6, 4.3))
    doc.save(_OUT / f"pref_{who}.docx")


def _guide(pairs: list[dict]) -> None:
    from docx import Document
    doc = Document()
    doc.add_heading("사람 선호 평가 설계서 — 질문 ↔ 가설 ↔ 개선 조치", 0)
    for line in ("평가지(pref_A·B)의 질문마다 무엇을 확인하고, 결과에 따라 무엇을 고칠지 정해 둔 문서입니다. "
                 "평가자에게는 주지 않습니다 — 가설을 알면 답이 그쪽으로 끌려갑니다.",
                 "비교 대상은 결론으로 쓰는 빈칸 채움 공정 비교(②)입니다. 10쌍은 판정기 결론(딸깍 승 5 · 원래 요청 승 5)과 "
                 "요청 유형별로 나눠 뽑았고, 지는 원인으로 지목한 원문 딸린 간단한 요청(up_14·up_36)은 반드시 넣었습니다."):
        doc.add_paragraph(line)
    _heading(doc, "가설과 판단 규칙", 1)
    _answer_table(doc, ["", "확인할 가설", "쓰는 질문", "이렇게 나오면", "이렇게 고친다"],
                  HYPOTHESES, (0.8, 3.6, 2.2, 5.4, 5.5))
    _heading(doc, "질문별 쓰임", 1)
    used = {q: [h for h, _, qs, _, _ in HYPOTHESES if q in qs] for q, *_ in PER_OUTPUT + PAIR}
    _answer_table(doc, ["", "보는 것", "질문", "쓰이는 가설"],
                  [(q, a, t.format(longer="결과물 N"), ", ".join(used[q])) for q, a, t, _ in PER_OUTPUT + PAIR],
                  (1.0, 2.2, 10.3, 4.0))
    _heading(doc, "뽑은 쌍", 1)
    _answer_table(doc, ["#", "요청", "유형", "판정기 결론", "더 긴 쪽", "빈칸 채움"],
                  [(str(n), p["item"], p["type"], "딸깍 승" if p["judge"] == "ttalkak" else "원래 요청 승",
                    "딸깍" if p["longer_is_ttalkak"] else "원래 요청", "예" if p["filled"] else "아니오")
                   for n, p in enumerate(pairs, 1)], (0.8, 1.8, 4.0, 3.0, 3.0, 2.5))
    doc.save(_OUT / "pref_guide.docx")


def build() -> list[dict]:
    src, fill = _load(SRC), _load(FILL)["rows"]
    items = {it["id"]: it for it in _load(_DIR / "uplift_set_v2.json")["items"]}
    pairs = pick(candidates(src, fill, items))
    for p in pairs:
        p["request"], t, r = _texts(p, src, fill, items)
        p["shown"] = (t, r) if p["ttalkak_first"] else (r, t)
        p["longer"] = 1 if len(p["shown"][0]) >= len(p["shown"][1]) else 2
        p["longer_is_ttalkak"] = len(t) >= len(r)
    for who in ("A", "B"):
        _sheet(who, pairs)
    _guide(pairs)
    key = [{"n": n, **{k: v for k, v in p.items() if k not in ("shown", "request")}} for n, p in enumerate(pairs, 1)]
    (_OUT / "pref_key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    return key


def read_answers(path) -> dict:
    """채운 pref_*.docx → {쌍 번호: {'P1': (결과물1, 결과물2), …, 'C2': 답, …}}.
    맨 앞 질문 목록 표 2개를 건너뛰고, 쌍마다 결과물 표(5열) 다음 비교 표(4열) 순서로 읽는다."""
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
    k = build()
    print(f"{len(k)}쌍 — {_OUT}/pref_A.docx · pref_B.docx · pref_guide.docx(설계서) · pref_key.json(정답지) — 뒤 둘은 평가자에게 주지 말 것")
