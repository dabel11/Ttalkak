"""
eval/human_review.py
────────────────────────────────────────────────────────────
사람 대조용 라벨링 시트를 만들고, 채워진 시트로 일치도를 계산한다. (자세한 배경은 eval/HUMAN_REVIEW.md)

왜 필요한가: 요구사항 충족률은 채점기의 **주 지표**인데, 판정기가 사람 판단과 맞는지 아직 모른다.
지금까지 확인한 것은 '내용을 지우면 yes→no 로 바뀐다'는 최소 민감도뿐이다(eval/req_sensitivity.py).

    python3 -m eval.human_review build              # 결과물 모음(.md) + 채점표 2부(.csv) 생성
    python3 -m eval.human_review judge              # 같은 질문을 판정기에 물어 저장
    python3 -m eval.human_review agree              # 사람끼리 κ · 사람 대 판정기 일치도

판정 기준(eval/HUMAN_REVIEW.md 와 같음):
  · 사람끼리 κ ≥ 0.6 이어야 질문이 명확한 것으로 본다. 낮으면 그 질문을 고치거나 뺀다.
  · 판정기–사람 일치도가 사람–사람 일치도와 비슷해야 판정기 수치를 결론에 쓴다.
"""

import argparse
import csv
import json
from pathlib import Path

from eval.requirement_judge import build_questions
from eval.uplift_stats import cohen_kappa

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


def build() -> None:
    items, outputs = _load()
    _OUT.mkdir(exist_ok=True)
    md = ["# 라벨링 대상 결과물\n",
          "각 결과물을 읽고, 같은 번호의 채점표(csv)에서 질문에 예/아니오로 답해 주세요.\n",
          "판단 기준은 **사용자 요청**입니다. 문체나 길이가 마음에 드는지는 보지 않습니다.\n"]
    rows = []
    for n, iid in enumerate(SAMPLE, 1):
        it, out = items[iid], outputs[iid]["output"]
        md += [f"\n---\n\n## {n}. {iid}\n", "**사용자 요청**\n", "```\n" + it["query"] + "\n```\n",
               "**AI 결과물**\n", "```\n" + out + "\n```\n"]
        for q in build_questions(it):
            rows.append({"번호": n, "문항": iid, "질문번호": q["id"],
                         "질문": q["text"] + (" (조건이 해당 없으면 '해당없음')" if q["conditional"] else ""),
                         "답(예/아니오/해당없음)": "",
                         "메모(헷갈린 이유 등)": ""})
    (_OUT / "outputs.md").write_text("".join(md), encoding="utf-8")
    for who in ("A", "B"):
        path = _OUT / f"sheet_{who}.csv"
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
    print(f"결과물 {len(SAMPLE)}건 · 질문 {len(rows)}개")
    print(f"  {_OUT/'outputs.md'}  ← 읽을 것")
    print(f"  {_OUT/'sheet_A.csv'} / {_OUT/'sheet_B.csv'}  ← 두 사람이 각자 채울 것(서로 보지 말 것)")


def judge() -> None:
    from dotenv import load_dotenv
    from groq import Groq
    from eval.defect_canary import call_patiently
    from eval.requirement_judge import judge_requirements
    load_dotenv()
    client = Groq(timeout=90)
    items, outputs = _load()
    path = _OUT / "judge.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for iid in SAMPLE:
        if iid in data:
            continue
        r = call_patiently(lambda: judge_requirements(client, "openai/gpt-oss-120b", items[iid], outputs[iid]["output"]), 6 * 3600)
        data[iid] = {q: a["verdict"] for q, a in r["answers"].items()}
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{iid}: {data[iid]}", flush=True)


_KO = {"예": "yes", "아니오": "no", "해당없음": "na", "yes": "yes", "no": "no", "na": "na"}


def _read_sheet(path: Path) -> dict:
    out = {}
    with path.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            ans = next((v for k, v in row.items() if k.startswith("답")), "").strip()
            if ans:
                out[(row["문항"], row["질문번호"])] = _KO.get(ans, ans)
    return out


def agree() -> None:
    a, b = _read_sheet(_OUT / "sheet_A.csv"), _read_sheet(_OUT / "sheet_B.csv")
    j = {(i, q): v for i, d in json.loads((_OUT / "judge.json").read_text(encoding="utf-8")).items() for q, v in d.items()}
    keys = [k for k in a if k in b]
    if not keys:
        raise SystemExit("두 시트에 함께 채워진 답이 없습니다.")
    pa, pb = [a[k] for k in keys], [b[k] for k in keys]
    print(f"사람이 함께 답한 질문 {len(keys)}개")
    print(f"  사람 A·B 일치 {sum(x == y for x, y in zip(pa, pb)) / len(keys):.1%} · κ={cohen_kappa(pa, pb)}")
    both = [k for k in keys if a[k] == b[k] and k in j]
    if both:
        hit = sum(j[k] == a[k] for k in both)
        print(f"  두 사람이 같게 답한 {len(both)}개 기준 판정기 일치 {hit / len(both):.1%}")
        for k in both:
            if j[k] != a[k]:
                print(f"    ✗ {k[0]} {k[1]}: 사람 {a[k]} / 판정기 {j[k]}")
    for who, p in (("A", a), ("B", b)):
        kk = [k for k in keys if k in j]
        print(f"  사람 {who} 대 판정기 κ={cohen_kappa([p[k] for k in kk], [j[k] for k in kk])}")


def main():
    ap = argparse.ArgumentParser(description="사람 대조 라벨링 시트 생성·일치도 계산")
    ap.add_argument("command", choices=["build", "judge", "agree"])
    {"build": build, "judge": judge, "agree": agree}[ap.parse_args().command]()


if __name__ == "__main__":
    main()
