"""비교 ①(빈칸 채운 딸깍 vs 정보 없는 원래 요청)을 pair-v2 로 재판정 — 빈칸 있던 34쌍. (rag-server 에서, PYTHONPATH=.)
판정 맥락은 fill_blanks 와 같게 '요청 + 사용자가 준 정보'."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fill_blanks import USAGE, Meter, patient          # noqa: E402
from eval.uplift_score import _client, judge_pair      # noqa: E402

SP = Path(__file__).parent
OUT = SP / "rejudge_flow_v2.json"
src = json.loads(Path("eval/results/uplift_trackB_v7_20261114.json").read_text(encoding="utf-8"))
fill = json.loads(Path("eval/results/uplift_trackB_v7_filled_20261114.json").read_text(encoding="utf-8"))["rows"]
items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
st = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
client = Meter(_client("gemini"))
for n, (k, f) in enumerate(sorted(fill.items()), 1):
    if k in st:
        continue
    iid, _, rep = k.split("|")
    v = patient(lambda: judge_pair(client, "gemini-3.6-flash", {**items[iid], "query": f["raw_facts_query"]},
                                   src["records"][f"{iid}|raw|{rep}"]["output"], f["ttalkak_filled"]["output"]))
    st[k] = {**v, "old": f["pair1_raw"]["winner"]}
    OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[{n}/{len(fill)}] {k} v1 {st[k]['old']} → v2 {v['winner']} · ${USAGE['in'] * 0.75e-6 + USAGE['out'] * 3.75e-6:.3f}", flush=True)
