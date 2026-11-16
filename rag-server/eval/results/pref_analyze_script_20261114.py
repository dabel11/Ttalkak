"""pref_A·B 답 집계 — pref_guide 의 가설(H1~H7, J) 판단 규칙대로. (rag-server 에서, PYTHONPATH=.)"""
import json
from collections import Counter
from statistics import mean
from eval.pref_materials import read_answers
from eval.uplift_stats import gwet_ac1

SP = "/private/tmp/claude-501/-Users-jidaehyun----Ttalkak/2ce35c77-6ef4-49e9-bde1-ea34c321ea13/scratchpad/"
key = {k["n"]: k for k in json.load(open("eval/human_review/pref_key.json"))}
raw = {"A": read_answers(SP + "inbox_prefA/in.docx"), "B": read_answers(SP + "inbox_prefB/in.docx")}
norm = lambda v: v.split(" ")[0] if v and v[0] in "ABCD가나다라마바사아" and (len(v) == 1 or v[1] == " ") else v.strip()


def side(n, who):
    """평가자 답을 딸깍(t)/원래 요청(r) 기준으로 다시 정렬."""
    k, a = key[n], raw[who][n]
    out = {}
    for q, v in a.items():
        if isinstance(v, tuple):
            first, second = (norm(v[0]), norm(v[1]))
            out[q] = {"t": first, "r": second} if k["ttalkak_first"] else {"t": second, "r": first}
        else:
            out[q] = norm(v)
    c2 = out["C2"]
    out["pick"] = "tie" if c2 == "동등" else ("ttalkak" if (c2 == "1") == k["ttalkak_first"] else "raw")
    return out


S = {w: {n: side(n, w) for n in key} for w in raw}
R = {}
for w in raw:
    s = S[w]
    picks = Counter(s[n]["pick"] for n in key)
    agree = [s[n]["pick"] == key[n]["judge"] for n in key if s[n]["pick"] != "tie"]
    sure = [s[n]["pick"] == key[n]["judge"] for n in key if s[n]["pick"] != "tie" and s[n]["C3"] in ("확실", "조금")]
    tr = lambda q: {x: Counter(s[n][q][x] for n in key) for x in ("t", "r")}
    R[w] = {
        "picks": dict(picks),
        "J_agree_judge": f"{sum(agree)}/{len(agree)}",
        "J_agree_judge_confident": f"{sum(sure)}/{len(sure)}",
        "H1_C1_when_judge_picked_longer": dict(Counter(s[n]["C1"] for n in key if key[n]["judge"] == "ttalkak")),
        "H1_C1_all": dict(Counter(s[n]["C1"] for n in key)),
        "H1_judge_longer_but_human_raw": [n for n in key if key[n]["judge"] == "ttalkak" and s[n]["pick"] == "raw"],
        "H2_transform_ttalkak_P4": {key[n]["item"]: s[n]["P4"]["t"] for n in key if key[n]["type"] == "원문 다듬기·변환"},
        "H2_transform_pick_C4": {key[n]["item"]: (s[n]["pick"], s[n]["C4"]) for n in key if key[n]["type"] == "원문 다듬기·변환"},
        "P4": tr("P4"), "P2": tr("P2"), "P5": tr("P5"), "P6": tr("P6"), "P3": tr("P3"),
        "H3_P7": tr("P7"),
        "H6_P1_mean": {x: round(mean(int(s[n]["P1"][x]) for n in key), 2) for x in ("t", "r")},
        "C4": dict(Counter(f"{s[n]['pick']}:{s[n]['C4']}" for n in key)),
        "C5": [s[n]["C5"] for n in key if s[n]["C5"] not in ("없음", "")],
    }
pa = [S["A"][n]["pick"] for n in key]; pb = [S["B"][n]["pick"] for n in key]
R["AB"] = {"pick_agree": f"{sum(x == y for x, y in zip(pa, pb))}/10", "AC1": round(gwet_ac1(pa, pb), 2),
           "per_pair": [(n, key[n]["item"], key[n]["type"], key[n]["judge"], S['A'][n]['pick'], S['B'][n]['pick']) for n in key]}
json.dump({"answers": S, "result": R}, open(SP + "pref_result.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1))
