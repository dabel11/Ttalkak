"""v10 사람 확인용 평가지(4쌍) — 1차 평가지와 같은 질문·형식. (rag-server 에서, PYTHONPATH=.)"""
import json
import random
from pathlib import Path
import eval.pref_materials as pm

SRC = "trial_v10_20261114.json"
# 꼭 넣을 쌍: v10 이 개수 제한 없이 코드에 맞춘 설명을 냈는데 결과물이 길어(1,264자 vs 682자) v2 가 원래 요청을 고른 쌍 —
# 남은 차이가 길이 판단인지 사람으로 가린다(답 받기 전에 정함)
MUST = "up_14|1"
d = json.load(open(f"eval/results/{SRC}"))
items = {it["id"]: it for it in json.load(open("eval/uplift_set_v2.json"))["items"]}
rng = random.Random(20261115)
by = {"b": [], "a": []}
for k, x in sorted(d.items()):
    if x.get("pair") and x["pair"]["v2"]["winner"] in by:
        by[x["pair"]["v2"]["winner"]].append(k)
pairs, seen = [], set()
for w in ("b", "a"):                          # 새 채점기 기준 딸깍 승 2 · 원래 요청 승 2, 서로 다른 요청
    ks = by[w][:]
    rng.shuffle(ks)
    ks.sort(key=lambda k: k != MUST)          # 안정 정렬 — 꼭 넣을 쌍만 앞으로
    for k in ks:
        iid = k.split("|")[0]
        if iid in seen or sum(p["judge_v2"] == w for p in pairs) == 2:
            continue
        seen.add(iid)
        x = d[k]
        tf = rng.random() < 0.5
        t, r = x["ttalkak"]["output"], x["raw"]["output"]
        pairs.append({"item": iid, "rep": int(k.split("|")[1]), "judge_v2": w, "judge_v1": x["pair"]["v1"]["winner"],
                      "ttalkak_first": tf, "request": x["query"], "shown": (t, r) if tf else (r, t)})
rng.shuffle(pairs)
for p in pairs:
    p["longer"] = 1 if len(p["shown"][0]) >= len(p["shown"][1]) else 2
for who in ("2차-A", "2차-B"):
    pm._sheet(who, pairs)
key = [{"n": n, "source": SRC, **{k: v for k, v in p.items() if k not in ("shown", "request")}} for n, p in enumerate(pairs, 1)]
(pm._OUT / "pref_2차_key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
print(key)
