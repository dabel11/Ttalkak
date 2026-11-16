"""생성 프롬프트 후보 소규모 측정 — 8개 요청 × 반복 0·1, 공정 비교(②) 방식, 판정은 pair-v1·pair-v2 둘 다. (rag-server 에서, PYTHONPATH=.)
app/rag/generator.py 를 후보 파일로 바꿔 둔 뒤 실행한다. v7 기준선은 같은 (요청, 반복)의 기존 판정.
    python3 v9_trial.py <label> [--limit N]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fill_blanks import FACT_INTRO, MAP_SYS, USAGE, Meter, facts_text, patient   # noqa: E402
from eval.placeholders import find_placeholders                                    # noqa: E402
from eval.uplift_eval import _loads_loose                                          # noqa: E402
import eval.uplift_score as us                                                       # noqa: E402
from eval.uplift_score import EXEC_MAX_TOKENS, NEUTRAL_SYSTEM, _chat, _client, judge_pair, make_prompt  # noqa: E402

V1 = {}
exec((Path(__file__).parent / "pair_v1_prompt.txt").read_text(encoding="utf-8"), V1)


def judge_both(it, a, b):
    out = {"v2": judge_pair(client, MODEL, it, a, b)}
    saved, us._PAIR_SYSTEM = us._PAIR_SYSTEM, V1["_PAIR_SYSTEM"]
    try:
        out["v1"] = judge_pair(client, MODEL, it, a, b)
    finally:
        us._PAIR_SYSTEM = saved
    return out

SP = Path(__file__).parent
LABEL = sys.argv[1]
OUT = SP / f"trial_{LABEL}.json"
ITEMS = ("up_14", "up_36", "up_16", "up_44", "up_48", "up_45", "up_10", "up_22")   # 원문 3 · 코드 2 · 창작 2 · 추천 1
MODEL = "gemini-3.6-flash"
REPS = (0, 1)
src = json.loads(Path("eval/results/uplift_trackB_v7_20261114.json").read_text(encoding="utf-8"))
facts = json.loads(Path("eval/results/uplift_trackB_v7_filled_20261114.json").read_text(encoding="utf-8"))["facts"]
items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
ids = list(ITEMS)
todo = [(i, r) for i in ids for r in REPS]
if "--limit" in sys.argv:
    todo = todo[:int(sys.argv[sys.argv.index("--limit") + 1])]
st = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
client = Meter(_client("gemini"))
for n, (iid, rep) in enumerate(todo, 1):
    k = f"{iid}|{rep}"
    row = st.get(k, {})
    if row.get("done"):
        continue
    if "prompt" not in row:
        p = patient(lambda: make_prompt("ttalkak", items[iid], "gemini-2.0-flash"))
        row.update(prompt=p["prompt"], mode=p["mode"])
    if row["prompt"] is None:                       # 되묻기 — 비교 대상 없음
        row["done"] = True
        st[k] = row
        OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[{n}/{len(todo)}] {k} 되묻기", flush=True)
        continue
    blanks = list(dict.fromkeys(b for _, _, b in find_placeholders(row["prompt"])))
    if blanks and iid in facts and "fill" not in row:
        m = patient(lambda: _chat(client, MODEL, MAP_SYS, json.dumps({"빈칸": blanks, "사용자 정보": facts[iid]}, ensure_ascii=False),
                                  3000, 0.0, json_mode=True))
        row["fill"] = {b: v for b, v in (_loads_loose(m["text"]).get("fill") or {}).items() if b in blanks and v}
    fill = row.get("fill") or {}
    filled = row["prompt"]
    for b, v in fill.items():
        filled = filled.replace(b, str(v))
    used = {b.strip("[]").replace(" 입력", ""): v for b, v in fill.items()}
    query = items[iid]["query"] + (FACT_INTRO + facts_text(used) + ")" if used else "")
    row.update(prompt_filled=filled, query=query, n_blanks=len(blanks), n_filled=len(fill))
    if "ttalkak" not in row:
        ex = patient(lambda: _chat(client, MODEL, NEUTRAL_SYSTEM, filled, EXEC_MAX_TOKENS, 0.7))
        row["ttalkak"] = {"output": ex["text"], "finish": ex["finish"]}
    if "raw" not in row:
        if used:                                    # 같은 정보를 원래 요청에도
            ex = patient(lambda: _chat(client, MODEL, NEUTRAL_SYSTEM, query, EXEC_MAX_TOKENS, 0.7))
            row["raw"] = {"output": ex["text"], "finish": ex["finish"], "reused": False}
        else:                                       # 정보가 없으면 v7 측정의 원래 요청 결과물 그대로
            row["raw"] = {"output": src["records"][f"{iid}|raw|{rep}"]["output"], "reused": True}
    if "pair" not in row:
        row["pair"] = patient(lambda: judge_both({**items[iid], "query": query}, row["raw"]["output"], row["ttalkak"]["output"]))
    row["len_ratio"] = len(row["ttalkak"]["output"]) / max(1, len(row["raw"]["output"]))
    row["done"] = True
    st[k] = row
    OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    usd = USAGE["in"] * 0.75e-6 + USAGE["out"] * 3.75e-6
    print(f"[{n}/{len(todo)}] {k} 빈칸 {len(fill)}/{len(blanks)} 길이비 {row['len_ratio']:.2f} → v1 {row['pair']['v1']['winner']} v2 {row['pair']['v2']['winner']} · 실행·판정 ${usd:.3f}", flush=True)
