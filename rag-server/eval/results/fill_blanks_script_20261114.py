"""빈칸 채움 재측정 — 트랙 B v7 의 딸깍 프롬프트 중 빈칸이 있는 것만 다시 실행한다. (rag-server 에서, PYTHONPATH=.)

  ① 딸깍(빈칸 채움) vs 원래 요청          — 실제 흐름: 딸깍이 빈칸을 묻고 사용자가 채운다
  ② 딸깍(빈칸 채움) vs 원래 요청 + 같은 정보 — 정보량을 맞춘 뒤에도 딸깍 구성이 나은가

사용자 정보 시트는 **요청 문장만 보고** 문항마다 1번 만들어 고정(facts) — 결과물·빈칸 이름을 보지 않는다.
빈칸 → 값 대응은 LLM 이 고르고, 치환은 코드가 한다(프롬프트 나머지 글자는 그대로).
판정 맥락: 두 비교 모두 판정기에 '요청 + 사용자가 준 정보'를 보여 준다(같은 정보를 쓴 쪽이 지어낸 것으로 보이지 않게).

    python3 fill_blanks.py --limit 3     # 시험
    python3 fill_blanks.py               # 전체(이어서)
"""
import argparse
import json
import sys
import time
from pathlib import Path

from eval.placeholders import find_placeholders
from eval.uplift_eval import _loads_loose
from eval.uplift_score import EXEC_MAX_TOKENS, NEUTRAL_SYSTEM, _chat, _client, judge_pair

SP = Path(__file__).parent
SRC = Path("eval/results/uplift_trackB_v7_20261114.json")
OUT = SP / "fill_blanks.json"
MODEL = "gemini-3.6-flash"           # v7 측정과 같은 실행·판정 모델
USAGE = {"in": 0, "out": 0, "calls": 0}


class Meter:
    """client 를 감싸 입력·출력(생각 포함) 토큰을 센다 — 비용 확인용."""
    def __init__(self, c):
        self._c = c
        self.chat = self
        self.completions = self

    def create(self, **kw):
        r = self._c.chat.completions.create(**kw)
        if r.usage:
            USAGE["in"] += r.usage.prompt_tokens or 0
            USAGE["out"] += (r.usage.total_tokens or 0) - (r.usage.prompt_tokens or 0)
        USAGE["calls"] += 1
        return r


def patient(fn, tries=6):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            if i == tries - 1:
                raise
            print(f"  재시도 {i + 1}: {str(e)[:80]}", flush=True)
            time.sleep(10 * (i + 1))


FACTS_SYS = """너는 실제 사용자를 흉내 내는 역할이다. 아래 짧은 요청을 보낸 한 사람을 구체적으로 상상하고,
그 사람이 이 요청에 관해 **이미 알고 있었을** 구체 정보를 10~14개 적는다(이름·일시·장소·대상·목적·숫자·특징·선호·제약 등).
값은 그럴듯하고 구체적으로(실존 상호·실존 인물은 피함). 요청에 이미 있는 내용은 반복하지 않는다.
반드시 JSON 한 개만: {"facts": {"항목": "값", ...}}"""

MAP_SYS = """프롬프트 속 빈칸 목록과 사용자 정보 목록을 받는다. 빈칸마다 그 자리에 들어갈 사용자 정보 값을 고른다.
정보 목록에 맞는 값이 없으면 null(지어내지 말 것). 값은 정보 목록의 값을 그대로 또는 짧게 이어 붙여 쓴다.
반드시 JSON 한 개만: {"fill": {"<빈칸 원문 그대로>": "값" 또는 null, ...}}"""

FACT_INTRO = "\n\n(참고로 내가 아는 정보: "


def facts_text(used: dict) -> str:
    return ", ".join(f"{k}: {v}" for k, v in used.items())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    src = json.loads(SRC.read_text(encoding="utf-8"))
    items = {it["id"]: it for it in json.loads(Path("eval/uplift_set_v2.json").read_text(encoding="utf-8"))["items"]}
    R = src["records"]
    st = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"facts": {}, "rows": {}}
    client = Meter(_client("gemini"))

    todo = sorted(k for k, r in R.items() if r["condition"] == "ttalkak" and r.get("prompt") and find_placeholders(r["prompt"]))
    if args.limit:
        todo = todo[:args.limit]
    print(f"대상 {len(todo)}개", flush=True)

    # 1) 사용자 정보 시트 — 요청 문장만 보고, 문항마다 한 번(이후 고정)
    for iid in sorted({R[k]["item"] for k in todo}):
        if iid not in st["facts"]:
            r = patient(lambda: _chat(client, MODEL, FACTS_SYS, items[iid]["query"], 4000, 0.7, json_mode=True))
            st["facts"][iid] = _loads_loose(r["text"]).get("facts") or {}
            OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")

    for n, k in enumerate(todo, 1):
        row = st["rows"].get(k, {})
        if row.get("done"):
            continue
        r = R[k]
        iid, rep = r["item"], r["repeat"]
        facts = st["facts"][iid]
        prompt = r["prompt"]
        blanks = list(dict.fromkeys(b for _, _, b in find_placeholders(prompt)))
        # 2) 빈칸 → 값 (LLM 이 고르고, 코드가 바꾼다)
        if "fill" not in row:
            m = patient(lambda: _chat(client, MODEL, MAP_SYS,
                                      json.dumps({"빈칸": blanks, "사용자 정보": facts}, ensure_ascii=False),
                                      3000, 0.0, json_mode=True))
            row["fill"] = {b: v for b, v in (_loads_loose(m["text"]).get("fill") or {}).items() if b in blanks and v}
        filled = prompt
        for b, v in row["fill"].items():
            filled = filled.replace(b, str(v))
        used = {b.strip("[]").replace(" 입력", ""): v for b, v in row["fill"].items()}
        query_facts = items[iid]["query"] + (FACT_INTRO + facts_text(used) + ")" if used else "")
        row.update(prompt_filled=filled, raw_facts_query=query_facts, used=used,
                   n_blanks=len(blanks), n_filled=len(row["fill"]))
        # 3) 실행 — v7 과 같은 중립 시스템·출력 예산·온도
        for name, p in (("ttalkak_filled", filled), ("raw_facts", query_facts)):
            if name not in row:
                ex = patient(lambda: _chat(client, MODEL, NEUTRAL_SYSTEM, p, EXEC_MAX_TOKENS, 0.7))
                row[name] = {"output": ex["text"], "finish": ex["finish"]}
        # 4) 짝 비교(순서 바꿔 2회) — 판정 맥락은 요청 + 사용자가 준 정보
        judge_item = {**items[iid], "query": query_facts}
        raw_out = R[f"{iid}|raw|{rep}"]["output"]
        for name, a in (("pair1_raw", raw_out), ("pair2_raw_facts", row["raw_facts"]["output"])):
            if name not in row:
                row[name] = patient(lambda: judge_pair(client, MODEL, judge_item, a, row["ttalkak_filled"]["output"]))
        row["old_winner"] = src["pairs"].get(f"{iid}|pair_raw_vs_ttalkak|{rep}", {}).get("winner")
        row["done"] = True
        st["rows"][k] = row
        st["usage"] = USAGE | {"usd_this_run": round(USAGE["in"] * 0.75e-6 + USAGE["out"] * 3.75e-6, 3)}
        OUT.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[{n}/{len(todo)}] {k} 빈칸 {row['n_filled']}/{row['n_blanks']} 채움 · 이전 {row['old_winner']} → "
              f"①{row['pair1_raw']['winner']} ②{row['pair2_raw_facts']['winner']} · 누적 ${st['usage']['usd_this_run']}",
              flush=True)


if __name__ == "__main__":
    sys.exit(main())
