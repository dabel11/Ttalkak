"""최종 측정 집계 — v7(배포) 대 v10, 트랙 B 공정 비교(두 판정기 + 합의) · 트랙 A 요구사항. (rag-server 에서, PYTHONPATH=.)"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median

from scipy.stats import beta, fisher_exact

import eval.uplift_score as us
from eval.uplift_stats import sign_test_p, wilson

SP = Path(__file__).parent
R = Path("eval/results")
items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
src = json.loads((R / "uplift_trackB_v7_20261114.json").read_text(encoding="utf-8"))
fill7 = json.loads((R / "uplift_trackB_v7_filled_20261114.json").read_text(encoding="utf-8"))["rows"]
v2_7 = json.loads((R / "uplift_trackB_v7_fair_pairv2_20261114.json").read_text(encoding="utf-8"))
B10 = json.loads((SP / "final_trackB_v10.json").read_text(encoding="utf-8"))
CAP = re.compile(r"(\d+|한|두|세|네|다섯)\s?(가지|개|문장|줄|단락|버전)(?![^\n]{0,6}이상)")
CHK = re.compile(r"체크리스트|점검 ?결과|✅|☑")
RANK = {"a": 0, "tie": 1, "b": 2}                   # a = 원래 요청 승, b = 딸깍 승
agree = lambda x, y: x if x == y else "split"


def v7_cell(k):
    iid, rep = k.split("|")
    p = v2_7.get(f"{iid}|pair_raw_vs_ttalkak|{rep}")
    if not p:
        return None
    f = fill7.get(f"{iid}|ttalkak|{rep}")
    t = f["ttalkak_filled"]["output"] if f else src["records"][f"{iid}|ttalkak|{rep}"]["output"]
    r = f["raw_facts"]["output"] if f else src["records"][f"{iid}|raw|{rep}"]["output"]
    pr = f["prompt_filled"] if f else src["records"][f"{iid}|ttalkak|{rep}"]["prompt"]
    return {"v1": p["old"], "v2": p["winner"], "t": t, "r": r, "prompt": pr}


def v10_cell(k):
    x = B10.get(k)
    if not x or x.get("prompt") is None or not x.get("pair"):
        return None
    return {"v1": x["pair"]["v1"]["winner"], "v2": x["pair"]["v2"]["winner"], "t": x["ttalkak"]["output"],
            "r": x["raw"]["output"], "prompt": x["prompt"]}


keys = [f"{i}|{r}" for i in sorted(i for i, it in items.items() if it["track"] == "B") for r in range(4)]
C = {"v7": {k: v7_cell(k) for k in keys}, "v10": {k: v10_cell(k) for k in keys}}
out = {"trackB": {}, "paired": {}, "behavior": {}, "items": {}}


def summ(cells, j):
    c = Counter((agree(x["v1"], x["v2"]) if j == "both" else x[j]) for x in cells)
    W, T, L = c["b"], c["tie"], c["a"]
    N = W + T + L + c["split"]
    lo, hi = wilson(L, N)
    return {"W": W, "T": T, "L": L, "split": c["split"], "N": N, "win": W / N, "loss": L / N, "loss_ci": (lo, hi),
            "p_vs_raw": sign_test_p(W, L), "P_better_than_raw": 1 - beta.cdf(.5, 1 + W, 1 + L)}


for ver, cells in C.items():
    xs = [x for x in cells.values() if x]
    out["trackB"][ver] = {j: summ(xs, j) for j in ("v1", "v2", "both")}
    out["trackB"][ver]["n_cells"] = len(xs)
    out["trackB"][ver]["asked_or_missing"] = sum(1 for x in cells.values() if not x)
    out["behavior"][ver] = {
        "len_ratio_median": median(len(x["t"]) / max(1, len(x["r"])) for x in xs),
        "checklist_outputs": sum(bool(CHK.search(x["t"])) for x in xs),
        "count_caps_in_prompt": sum(bool(CAP.search(x["prompt"].split("[더 좋은 결과를 위한 조건]")[-1]))
                                    and not CAP.search(items[k.split("|")[0]]["query"]) for k, x in cells.items() if x),
        "prompt_len_median": median(len(x["prompt"]) for x in xs),
    }
# 같은 (요청, 회차) 짝: v10 결과가 v7 보다 나아졌나(원래 요청 승 < 비슷 < 딸깍 승)
for j in ("v1", "v2", "both"):
    up = down = same = 0
    for k in keys:
        a, b = C["v7"][k], C["v10"][k]
        if not a or not b:
            continue
        ra = RANK.get(agree(a["v1"], a["v2"]) if j == "both" else a[j], 1)
        rb = RANK.get(agree(b["v1"], b["v2"]) if j == "both" else b[j], 1)
        up += rb > ra
        down += rb < ra
        same += rb == ra
    l7, l10 = out["trackB"]["v7"][j], out["trackB"]["v10"][j]
    out["paired"][j] = {"better": up, "worse": down, "same": same, "sign_p": sign_test_p(up, down),
                        "loss_fisher_p": fisher_exact([[l7["L"], l7["N"] - l7["L"]], [l10["L"], l10["N"] - l10["L"]]])[1]}
# 요청 단위(17개): 요청마다 (승 − 패) 가 v7 보다 커졌나 — v2 판정
per = defaultdict(lambda: {"v7": 0, "v10": 0, "n7": 0, "n10": 0})
for k in keys:
    for ver in ("v7", "v10"):
        x = C[ver][k]
        if x:
            per[k.split("|")[0]][ver] += (x["v2"] == "b") - (x["v2"] == "a")
            per[k.split("|")[0]]["n" + ver[1:]] += 1
# 한쪽 버전이 모든 회차를 되묻기로 끝낸 요청은 비교할 결과물이 없다 — 0 을 '동률'로 세면 안 된다(up_42: v10 4회 모두 되묻기)
per = {i: v for i, v in per.items() if v["n7"] and v["n10"]}
ib = sum(v["v10"] > v["v7"] for v in per.values())
iw = sum(v["v10"] < v["v7"] for v in per.values())
out["items"] = {"better": ib, "worse": iw, "same": len(per) - ib - iw, "sign_p": sign_test_p(ib, iw), "per_item": per}

# ── 트랙 A ──
dataA = {"records": {}, "pairs": {}, "runs": []}
for part in (0, 1):
    p = SP / f"final_trackA_v10_part{part}.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        dataA["records"].update(d["records"])
        dataA["runs"] += d["runs"]
repA = us.report(dataA, items)
pick = lambda name: next((v for k, v in repA["comparisons"].items() if k.startswith(name)), {})
out["trackA"] = {name: {k: v for k, v in (pick(name).get("ttalkak vs raw") or next(iter(pick(name).values()), {})).items()
                        if k in ("n", "mean_a", "mean_b", "mean_diff", "ci95", "wins", "ties", "losses", "sign_p")}
                 for name in ("요구사항 충족률", "정확성", "지어내기", "자리표시자 개수")}
out["trackA"]["incomplete"] = repA.get("req_incomplete")
out["trackA"]["n_records"] = Counter(r["condition"] for r in dataA["records"].values())
(R / "final_v10_summary_20261115.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
(R / "uplift_trackA_v10_20261115.json").write_text(json.dumps(dataA, ensure_ascii=False, indent=1), encoding="utf-8")
(R / "uplift_trackB_v10_fair_20261115.json").write_text(json.dumps(B10, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({k: v for k, v in out.items() if k != "items"}, ensure_ascii=False, indent=1, default=float))
print("items", {k: v for k, v in out["items"].items() if k != "per_item"})
