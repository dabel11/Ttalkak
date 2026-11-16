"""최종 측정(v10) — 한 프로세스에서 스레드로 동시에. (rag-server 에서, PYTHONPATH=., app/rag/generator.py = v10)
  (1) 트랙 B: 17요청 × 4회, 공정 비교(②) — 빈칸은 요청 문장만 보고 만든 사용자 정보로 채우고 원래 요청에도 같은 정보. 판정 pair-v1·v2 둘 다.
      이미 끝난 v10 소규모 측정(8요청 × 0·1회)은 그대로 쓴다.
  (2) 트랙 A: 31요청 × 1회, 사람 대조로 검증된 요구사항 판정기(원래 요청 기록은 v8 측정 것을 재사용).
임베딩·리랭커 모델이 프로세스마다 수 GB 라 프로세스를 나누지 않는다. 검색(retrieve_contexts)만 잠금으로 한 번에 하나씩.
"""
import json
import sys
import threading
from argparse import Namespace
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fill_blanks import FACT_INTRO, FACTS_SYS, MAP_SYS, USAGE, Meter, facts_text, patient   # noqa: E402
import app.main as main_mod                                                                    # noqa: E402
import eval.uplift_score as us                                                                 # noqa: E402
from eval.placeholders import find_placeholders, mask                                          # noqa: E402
from eval.uplift_eval import _loads_loose                                                      # noqa: E402

SP = Path(__file__).parent
R = Path("eval/results")
MODEL = "gemini-3.6-flash"
OUT_B = SP / "final_trackB_v10.json"
OUT_FACTS = SP / "final_facts_extra.json"

_retrieve = main_mod.retrieve_contexts
_RLOCK = threading.Lock()


def _locked_retrieve(*a, **k):
    with _RLOCK:
        return _retrieve(*a, **k)


main_mod.retrieve_contexts = _locked_retrieve      # make_prompt 가 호출 시점에 app.main 에서 꺼내 쓴다

V1 = {}
exec((SP / "pair_v1_prompt.txt").read_text(encoding="utf-8"), V1)
SYSTEMS = {"v2": us._PAIR_SYSTEM, "v1": V1["_PAIR_SYSTEM"]}


def judge(client, it, a, b, system):
    """us.judge_pair 와 같은 규칙(순서 바꿔 2회, 둘 다 같아야 승부) — 판정 프롬프트를 스레드마다 넘기려고 따로 둔다."""
    res, fin = [], []
    for first, second, a_pos in ((a, b, "1"), (b, a, "2")):
        user = f"[사용자 요청]\n{it['query']}\n\n[결과물 1]\n{mask(first)}\n\n[결과물 2]\n{mask(second)}"
        r = us._chat(client, MODEL, system, user, 4000, 0.0, json_mode=True)
        w = str(_loads_loose(r["text"]).get("winner", "")).strip()
        res.append("a" if w == a_pos else ("tie" if w in ("tie", "") else "b"))
        fin.append(r["finish"])
    return {"winner": res[0] if res[0] == res[1] else "tie", "passes": res, "finish": fin}


items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
src = json.loads((R / "uplift_trackB_v7_20261114.json").read_text(encoding="utf-8"))
facts = json.loads((R / "uplift_trackB_v7_filled_20261114.json").read_text(encoding="utf-8"))["facts"]
client = Meter(us._client("gemini"))
W_LOCK = threading.Lock()

# 사용자 정보 시트가 없는 요청 — fill_blanks 와 같은 방식(요청 문장만 보고 1회, 결과물을 보기 전)으로 만든다
extra = json.loads(OUT_FACTS.read_text(encoding="utf-8")) if OUT_FACTS.exists() else {}
for iid in sorted(i for i, it in items.items() if it["track"] == "B" and i not in facts and i not in extra):
    r = patient(lambda: us._chat(client, MODEL, FACTS_SYS, items[iid]["query"], 4000, 0.7, json_mode=True))
    extra[iid] = _loads_loose(r["text"]).get("facts") or {}
    OUT_FACTS.write_text(json.dumps(extra, ensure_ascii=False, indent=1), encoding="utf-8")
facts = {**facts, **extra}

# ── (1) 트랙 B ────────────────────────────────────────────────
st = json.loads(OUT_B.read_text(encoding="utf-8")) if OUT_B.exists() else {}
for k, x in json.loads((R / "trial_v10_20261114.json").read_text(encoding="utf-8")).items():
    if x.get("done") and k not in st:                 # 소규모 측정 16칸 — pair 를 v1/v2 키로 그대로 쓴다
        st[k] = x
todo = [f"{i}|{r}" for i in sorted(i for i, it in items.items() if it["track"] == "B") for r in range(4)
        if not st.get(f"{i}|{r}", {}).get("done")]


def commit_b(k, row):
    with W_LOCK:                                      # 넣기와 쓰기를 한 잠금 안에서 — 쓰는 도중 다른 스레드가 dict 를 바꾸지 않게
        st[k] = row
        OUT_B.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def one_b(k):
    iid, rep = k.split("|")[0], int(k.split("|")[1])
    row = {}
    p = patient(lambda: us.make_prompt("ttalkak", items[iid], "gemini-2.0-flash"))
    row.update(prompt=p["prompt"], mode=p["mode"])
    if p["prompt"] is None:
        row["done"] = True
        commit_b(k, row)
        return f"{k} 되묻기"
    blanks = list(dict.fromkeys(b for _, _, b in find_placeholders(p["prompt"])))
    fill = {}
    if blanks and facts.get(iid):
        m = patient(lambda: us._chat(client, MODEL, MAP_SYS, json.dumps({"빈칸": blanks, "사용자 정보": facts[iid]}, ensure_ascii=False),
                                     3000, 0.0, json_mode=True))
        fill = {b: v for b, v in (_loads_loose(m["text"]).get("fill") or {}).items() if b in blanks and v}
    filled = p["prompt"]
    for b, v in fill.items():
        filled = filled.replace(b, str(v))
    used = {b.strip("[]").replace(" 입력", ""): v for b, v in fill.items()}
    query = items[iid]["query"] + (FACT_INTRO + facts_text(used) + ")" if used else "")
    row.update(fill=fill, prompt_filled=filled, query=query, n_blanks=len(blanks), n_filled=len(fill))
    ex = patient(lambda: us._chat(client, MODEL, us.NEUTRAL_SYSTEM, filled, us.EXEC_MAX_TOKENS, 0.7))
    row["ttalkak"] = {"output": ex["text"], "finish": ex["finish"]}
    old_raw = src["records"].get(f"{iid}|raw|{rep}", {})
    if used or not old_raw.get("output"):             # 같은 정보를 원래 요청에도 / 기록이 없으면 새로
        ex = patient(lambda: us._chat(client, MODEL, us.NEUTRAL_SYSTEM, query, us.EXEC_MAX_TOKENS, 0.7))
        row["raw"] = {"output": ex["text"], "finish": ex["finish"], "reused": False}
    else:
        row["raw"] = {"output": old_raw["output"], "reused": True}
    jit = {**items[iid], "query": query}
    row["pair"] = {v: patient(lambda: judge(client, jit, row["raw"]["output"], row["ttalkak"]["output"], s))
                   for v, s in SYSTEMS.items()}
    row["len_ratio"] = len(row["ttalkak"]["output"]) / max(1, len(row["raw"]["output"]))
    row["done"] = True
    commit_b(k, row)
    return f"{k} 빈칸 {len(fill)}/{len(blanks)} 길이비 {row['len_ratio']:.2f} → v1 {row['pair']['v1']['winner']} v2 {row['pair']['v2']['winner']}"


# ── (2) 트랙 A — uplift_score.run 그대로(요구사항·결함 판정), 요청을 둘로 나눠 두 스레드 ──
v8 = json.loads((R / "uplift_trackA_v8_20261114.json").read_text(encoding="utf-8"))
a_items = [it for it in items.values() if it["track"] == "A"]
A_ARGS = Namespace(set="uplift_set_v2.json", items="", track="A", conditions=["raw", "ttalkak"], repeats=1,
                   gen_model="gemini-2.0-flash", backend="gemini", target_model=MODEL, judge_model=MODEL,
                   skip_pairwise=True, max_wait=6 * 3600, out="")


def run_a(part, its):
    out = SP / f"final_trackA_v10_part{part}.json"
    data = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {
        "records": {k: r for k, r in v8["records"].items() if r["condition"] == "raw" and r["item"] in {i["id"] for i in its}},
        "pairs": {}, "runs": []}
    data["runs"].append({**us.provenance(), "args": {**vars(A_ARGS), "out": str(out)}})
    us.run(A_ARGS, its, data, out)
    return f"트랙 A part{part} 끝"


if __name__ == "__main__":
    print(f"트랙 B 남은 {len(todo)}칸 · 트랙 A {len(a_items)}요청", flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(run_a, n, a_items[n::2]) for n in (0, 1)] + [pool.submit(one_b, k) for k in todo]
        done = 0
        for f in as_completed(futs):
            done += 1
            try:
                msg = f.result()
            except Exception as e:                     # 한 칸이 끝내 실패해도 나머지는 계속 — 다시 실행하면 이어서 한다
                msg = f"실패: {str(e)[:120]}"
            usd = USAGE["in"] * 0.75e-6 + USAGE["out"] * 3.75e-6
            print(f"[{done}/{len(futs)}] {msg} · 트랙 B 실행·판정 ${usd:.2f}", flush=True)
    print("DONE", flush=True)
