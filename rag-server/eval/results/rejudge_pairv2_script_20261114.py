"""공정 비교(②) 쌍을 짝 비교 판정기 pair-v2 로 다시 판정 — 결과물은 그대로, 판정만. (rag-server 에서, PYTHONPATH=.)
    python3 rejudge_v2.py pref     # 사람이 평가한 10쌍만
    python3 rejudge_v2.py all      # 61쌍 전체(이어서)
"""
import json
import sys
import time
from pathlib import Path

from eval.uplift_score import PAIR_JUDGE_VERSION, _client, judge_pair

SP = Path(__file__).parent
OUT = SP / "rejudge_v2.json"
MODEL = "gemini-3.6-flash"
U = {"in": 0, "out": 0}


class Meter:
    def __init__(self, c):
        self._c, self.chat, self.completions = c, self, self

    def create(self, **kw):
        r = self._c.chat.completions.create(**kw)
        if r.usage:
            U["in"] += r.usage.prompt_tokens or 0
            U["out"] += (r.usage.total_tokens or 0) - (r.usage.prompt_tokens or 0)
        return r


def patient(fn):
    for i in range(6):
        try:
            return fn()
        except Exception as e:
            if i == 5:
                raise
            print(f"  재시도 {i + 1}: {str(e)[:80]}", flush=True)
            time.sleep(10 * (i + 1))


src = json.loads(Path("eval/results/uplift_trackB_v7_20261114.json").read_text(encoding="utf-8"))
fill = json.loads(Path("eval/results/uplift_trackB_v7_filled_20261114.json").read_text(encoding="utf-8"))["rows"]
items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
keys = sorted(k for k in src["pairs"] if "pair_raw_vs_ttalkak" in k)
if sys.argv[1] == "pref":
    pref = {(p["item"], p["rep"]) for p in json.load(open("eval/human_review/pref_key.json"))}
    keys = [k for k in keys if (k.split("|")[0], int(k.split("|")[2])) in pref]
st = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
client = Meter(_client("gemini"))
for n, k in enumerate(keys, 1):
    if k in st:
        continue
    iid, _, rep = k.split("|")
    f = fill.get(f"{iid}|ttalkak|{rep}")
    if f:
        it, a, b = {**items[iid], "query": f["raw_facts_query"]}, f["raw_facts"]["output"], f["ttalkak_filled"]["output"]
        old = f["pair2_raw_facts"]["winner"]
    else:
        R = src["records"]
        it, a, b = items[iid], R[f"{iid}|raw|{rep}"]["output"], R[f"{iid}|ttalkak|{rep}"]["output"]
        old = src["pairs"][k]["winner"]
    v = patient(lambda: judge_pair(client, MODEL, it, a, b))
    st[k] = {**v, "old": old}
    OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    usd = U["in"] * 0.75e-6 + U["out"] * 3.75e-6
    print(f"[{n}/{len(keys)}] {k} v1 {old} → {PAIR_JUDGE_VERSION} {v['winner']} {v['passes']} {v['finish']} · ${usd:.3f}", flush=True)
