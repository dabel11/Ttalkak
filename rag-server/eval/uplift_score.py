"""
eval/uplift_score.py
────────────────────────────────────────────────────────────
결과 상향 채점기 — "딸각이 AI 결과물을 실제로 얼마나 좋게 만드는가"를 잰다.

세 조건으로 같은 요청의 결과물을 만든다(차이는 '프롬프트가 무엇을 거쳤나' 하나뿐):
  raw      : 원래 요청을 그대로 실행 모델에 넣음
  rewrite  : 딸각 생성기로 다듬되 **검색 없이**(근거 0개)       → 'LLM 이 한 번 다듬기만 한' 효과
  ttalkak  : 운영 /query 와 같은 검색 + 생성(app.main.retrieve_contexts · run_generation)
세 조건 모두 같은 실행 모델·같은 중립 시스템 프롬프트로 결과물을 만든다.

결과물마다 매기는 것(uplift_set_v2.json 정의):
  - 요구사항 충족률·정확성       : judge (eval/requirement_judge.py)  ⚠️ 사람 대조 검증 전 — 잠정
  - 코드 판정(형식·정보 보존)     : 코드 (eval/code_checks.py)
  - 결함: 자리표시자            : 코드
          지어내기(생성, entity) : 코드 (eval/value_check.py)
          지어내기(가공)·거부    : judge (eval/defect_canary.build_system) — '심각한 지어내기'만 잡는다
  - 트랙 B 쌍대 선호            : judge, 순서 바꿔 2회 — 두 번 모두 같은 쪽이면 승부 인정

비교는 문항 단위 짝 비교(eval/uplift_stats.py). 딸각이 '되묻기(ask)'로 빠진 반복은
결과물이 없어 비교에서 빼고 되묻기 비율로 따로 보고한다.

사용법 (rag-server/ 에서):
    python3 -m eval.uplift_score --dry-run                       # 호출 수·토큰 추정만
    python3 -m eval.uplift_score --items up_04,up_09 --repeats 1  # 작은 실행
    python3 -m eval.uplift_score --report eval/results/xxx.json   # 저장된 결과로 보고서만

결과 파일은 호출마다 갱신되고, 다시 실행하면 이미 있는 (문항·조건·반복)은 건너뛴다.
"""

import argparse
import datetime
import hashlib
import json
import subprocess
import time
from pathlib import Path

from eval.code_checks import run_item
from eval.defect_canary import build_system as build_defect_system, call_patiently, judged_keys
from eval.placeholders import mask
from eval.uplift_stats import mean, paired, within_spread, wilson

_DIR = Path(__file__).parent
CONDITIONS = ("raw", "rewrite", "ttalkak")
CODE_CATEGORIES = {"코드 리뷰", "디버깅", "코드 작성"}
NEUTRAL_SYSTEM = "너는 유능한 한국어 AI 어시스턴트다. 사용자의 요청을 충실히 수행해 결과물을 직접 만들어라."

# 토큰 추정(1회 호출, 입력+출력) — --dry-run 용 어림값. 실행 결과 파일의 usage 로 보정할 것.
EST_TOKENS = {"generate": 10000, "execute": 2500, "req_judge": 2500, "defect_judge": 2200, "pair_judge": 3500}
TPD_FREE = 200_000

_PAIR_SYSTEM = """너는 두 AI 결과물의 품질을 비교하는 엄격하고 공정한 평가자다.
같은 사용자 요청에 대한 결과물 [1]과 [2]를 받는다. 어느 쪽이 어떤 방식으로 만들어졌는지는 모른다.
오직 '사용자 요청을 얼마나 잘 충족했는가'로 판단한다: 요청 반영, 바로 쓸 수 있는 구체성, 정확성.
길다고 좋은 게 아니다. 결과물 속 ⟦자리표시자⟧는 나중에 채울 빈자리다. 차이가 없으면 "tie".
반드시 아래 JSON 한 개만 출력: {"winner": "1"|"2"|"tie", "reason": "<한 줄>"}"""


# ── 호출 ──────────────────────────────────────────────────────
def _groq(timeout: float = 90):
    from dotenv import load_dotenv
    from groq import Groq
    load_dotenv()
    return Groq(timeout=timeout)


def _chat(client, model: str, system: str, user: str, max_tokens: int,
          temperature: float, json_mode: bool = False) -> dict:
    kw = {"reasoning_effort": "low"} if model.startswith("openai/gpt-oss") else {}
    if json_mode:
        kw["response_format"] = {"type": "json_object"}
    r = client.chat.completions.create(
        model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature, **kw)
    c = r.choices[0]
    return {"text": (c.message.content or "").strip(), "finish": c.finish_reason,
            "usage": r.usage.total_tokens if r.usage else None}


def make_prompt(condition: str, item: dict, gen_model: str) -> dict:
    """조건별 실행 프롬프트. 딸각이 되묻기로 빠지면 prompt=None."""
    query = item["query"]
    if condition == "raw":
        return {"prompt": query, "mode": "raw"}
    from app.main import QueryRequest, retrieve_contexts, run_generation
    if condition == "rewrite":
        contexts = []
    else:
        retrieved, examples, _ = retrieve_contexts(QueryRequest(query=query, collection_name="prompt_techniques"))
        contexts = retrieved + examples
    gen = run_generation(query, contexts, gen_model, [])
    prompt = gen.get("improved_prompt") if gen.get("mode") == "improve" else None
    return {"prompt": prompt or None, "mode": gen.get("mode"), "n_contexts": len(contexts),
            "questions": len(gen.get("questions") or [])}


def judge_defects(client, model: str, system: str, item: dict, output: str) -> dict:
    from eval.uplift_eval import _loads_loose
    user = f"[작업 유형]\n{item['task_type']}\n\n[사용자 요청]\n{item['query']}\n\n[결과물]\n{mask(output)}"
    r = _chat(client, model, system, user, 1200, 0.0, json_mode=True)
    v = _loads_loose(r["text"])
    return {"verdict": v, "usage": r["usage"]}


def judge_pair(client, model: str, item: dict, out_a: str, out_b: str) -> dict:
    """a·b 를 순서 바꿔 2회 비교. 반환 winner ∈ {'a','b','tie'} — 두 번 모두 같은 쪽이어야 승부."""
    from eval.uplift_eval import _loads_loose
    res = []
    for first, second, a_pos in ((out_a, out_b, "1"), (out_b, out_a, "2")):
        user = f"[사용자 요청]\n{item['query']}\n\n[결과물 1]\n{mask(first)}\n\n[결과물 2]\n{mask(second)}"
        r = _chat(client, model, _PAIR_SYSTEM, user, 1200, 0.0, json_mode=True)
        w = str(_loads_loose(r["text"]).get("winner", "")).strip()
        res.append("a" if w == a_pos else ("tie" if w in ("tie", "") else "b"))
    return {"winner": res[0] if res[0] == res[1] else "tie", "passes": res}


# ── 결과물 하나 채점 ─────────────────────────────────────────
def score_output(item: dict, output: str, req: dict | None, defect: dict | None) -> dict:
    from eval.requirement_judge import rates
    code = run_item(item, output)
    checks = code["checks"]
    by_basis = {}
    for c in checks:
        by_basis.setdefault(c["check"]["basis"], []).append(c["passed"])
    v = (defect or {}).get("verdict") or {}
    judged = judged_keys(item["task_type"])
    if item["task_type"] == "transform" and item.get("category") in CODE_CATEGORIES:
        fabrication = None                     # 코드 속 예시 값·테스트 데이터를 지어내기로 봄(2026-09-19 검증) — 범위 밖
    elif item["task_type"] == "transform":
        fabrication = v.get("fabrication") if isinstance(v.get("fabrication"), bool) else None
    elif item.get("entity_facts"):
        fabrication = bool(code["invented_values"])
    else:
        fabrication = None                     # 일반 지식·코드·계획 생성 문항 — 측정 범위 밖
    return {
        **(rates(req) if req else {"requirement_rate": None, "subjective_rate": None, "gold_rate": None}),
        "check_rate": {b: sum(v2) / len(v2) for b, v2 in by_basis.items()},
        "preserve_ok": all(by_basis.get("preserve", [True])),
        "placeholder_defect": code["placeholder_defect"],
        # 참고 지표 — 결함은 아니지만 바로 쓸 수 없는 정도. 딸각 개선안이 '[제품명 입력]' 같은 칸을 넣고
        # 실행 모델이 그대로 옮기는 사례가 스모크 테스트에서 나왔다(2026-09-20 up_46)
        "placeholder_count": len(code["placeholders"]),
        "fabrication": fabrication,
        "invented_values": code["invented_values"],
        "refusal": v.get("refusal") if "refusal" in judged and isinstance(v.get("refusal"), bool) else None,
        "judge_errors": (req or {}).get("errors", []),
    }


# ── 실행 ──────────────────────────────────────────────────────
def provenance() -> dict:
    """결과를 만든 코드 상태 — 생성기가 다른 작업으로 바뀌는 중에도 어떤 버전으로 쟀는지 남긴다."""
    def git(*a):
        try:     # 앞 공백을 지우면 porcelain 첫 줄 경로가 잘린다(' M rag-server' → 'ag-server') — 끝만 정리
            return subprocess.run(["git", *a], capture_output=True, text=True, timeout=10).stdout.rstrip()
        except Exception:
            return ""
    from app.rag import generator
    return {
        "git_head": git("rev-parse", "--short", "HEAD").strip(),
        "dirty": [l[3:] for l in git("status", "--porcelain").splitlines() if l[:2].strip() and "eval/" not in l],
        "generator_prompt_sha": hashlib.sha256(generator.SYSTEM_PROMPT.encode()).hexdigest()[:12],
        "at": datetime.datetime.now().isoformat(timespec="seconds"),
    }


def estimate(items: list[dict], conditions: list[str], repeats: int) -> dict:
    per = {"generate": 0, "execute": 0, "req_judge": 0, "defect_judge": 0, "pair_judge": 0}
    for it in items:
        for c in conditions:
            per["execute"] += repeats
            per["req_judge"] += repeats
            per["defect_judge"] += repeats
            if c != "raw":
                per["generate"] += repeats
        if it["track"] == "B" and "ttalkak" in conditions:
            per["pair_judge"] += repeats * 2 * sum(c in conditions for c in ("raw", "rewrite"))
    tokens = {k: n * EST_TOKENS[k] for k, n in per.items()}
    return {"calls": per, "tokens": tokens, "total_tokens": sum(tokens.values())}


def run(args, items: list[dict], data: dict, out: Path) -> None:
    client = _groq()
    defect_system = build_defect_system(json.loads((_DIR / "uplift_set_v2.json").read_text(encoding="utf-8"))["defects"])
    from eval.requirement_judge import judge_requirements
    recs = data["records"]
    patient = lambda fn: call_patiently(fn, args.max_wait)
    total = len(items) * len(args.conditions) * args.repeats
    n = 0
    for rep in range(args.repeats):
        for it in items:
            for cond in args.conditions:
                n += 1
                key = f"{it['id']}|{cond}|{rep}"
                if key in recs:
                    continue
                t0 = time.time()
                p = patient(lambda: make_prompt(cond, it, args.gen_model))
                rec = {"item": it["id"], "condition": cond, "repeat": rep, **{k: p[k] for k in p if k != "prompt"},
                       "prompt": p["prompt"]}
                if p["prompt"] is None:
                    rec["asked"] = True
                else:
                    ex = patient(lambda: _chat(client, args.target_model, NEUTRAL_SYSTEM, p["prompt"], 3000, 0.7))
                    rec.update(output=ex["text"], exec_finish=ex["finish"], exec_usage=ex["usage"])
                    req = patient(lambda: judge_requirements(client, args.judge_model, it, ex["text"]))
                    dj = patient(lambda: judge_defects(client, args.judge_model, defect_system, it, ex["text"]))
                    rec.update(req_judge={k: req[k] for k in ("answers", "errors", "version")},
                               defect_judge=dj, score=score_output(it, ex["text"], req, dj))
                rec["seconds"] = round(time.time() - t0, 1)
                recs[key] = rec
                out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                s = rec.get("score") or {}
                print(f"[{n:>3}/{total}] {it['id']} {cond:<8} #{rep}  "
                      + ("되묻기" if rec.get("asked") else
                         f"요구 {s.get('requirement_rate')} · 결함 지어내기={s.get('fabrication')} 거부={s.get('refusal')}"),
                      flush=True)
    # 트랙 B 쌍대 선호
    if "ttalkak" in args.conditions and not args.skip_pairwise:
        for rep in range(args.repeats):
            for it in items:
                if it["track"] != "B":
                    continue
                t = recs.get(f"{it['id']}|ttalkak|{rep}", {})
                for other in ("raw", "rewrite"):
                    key = f"{it['id']}|pair_{other}_vs_ttalkak|{rep}"
                    o = recs.get(f"{it['id']}|{other}|{rep}", {})
                    if key in data["pairs"] or not t.get("output") or not o.get("output"):
                        continue
                    data["pairs"][key] = patient(lambda: judge_pair(client, args.judge_model, it, o["output"], t["output"]))
                    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                    print(f"  쌍대 {it['id']} {other} vs ttalkak #{rep}: {data['pairs'][key]['winner']}", flush=True)


# ── 보고서 ────────────────────────────────────────────────────
def per_item(data: dict, metric) -> dict:
    """{조건: {문항: 반복 평균}} 과 {조건: {문항: [반복값]}}."""
    avg, reps = {}, {}
    for r in data["records"].values():
        if r.get("asked"):
            continue
        v = metric(r["score"])
        reps.setdefault(r["condition"], {}).setdefault(r["item"], []).append(v)
    for c, d in reps.items():
        avg[c] = {i: mean(vs) for i, vs in d.items()}
    return avg, reps


def report(data: dict, items_by_id: dict) -> dict:
    metrics = {
        "요구사항 충족률(주관 제외) ⚠️잠정": lambda s: s["requirement_rate"],
        "정확성(gold) ⚠️잠정": lambda s: s["gold_rate"],
        "정보 보존(코드)": lambda s: s["check_rate"].get("preserve"),
        "형식 제약(코드)": lambda s: s["check_rate"].get("request"),
        "지어내기 비율(낮을수록 좋음)": lambda s: None if s["fabrication"] is None else float(s["fabrication"]),
        "거부 비율(낮을수록 좋음)": lambda s: None if s["refusal"] is None else float(s["refusal"]),
        "자리표시자 결함(낮을수록 좋음)": lambda s: float(s["placeholder_defect"]),
        "자리표시자 개수(참고·낮을수록 바로 쓰기 쉬움)": lambda s: float(s.get("placeholder_count", 0)),
    }
    out = {"comparisons": {}, "ask_rate": {}, "within_spread": {}, "pairwise": {}}
    for cond in CONDITIONS:
        rs = [r for r in data["records"].values() if r["condition"] == cond]
        if rs:
            k = sum(bool(r.get("asked")) for r in rs)
            out["ask_rate"][cond] = {"asked": k, "n": len(rs), "wilson95": wilson(k, len(rs))}
    for name, fn in metrics.items():
        avg, reps = per_item(data, fn)
        out["within_spread"][name] = {c: within_spread(reps[c]) for c in reps}
        for a, b in (("raw", "ttalkak"), ("rewrite", "ttalkak"), ("raw", "rewrite")):
            if a in avg and b in avg:
                out["comparisons"].setdefault(name, {})[f"{b} − {a}"] = paired(avg[a], avg[b])
                for group in ("A", "B"):
                    ids = [i for i in avg[a] if items_by_id[i]["track"] == group]
                    sub = paired({i: avg[a][i] for i in ids}, {i: avg[b].get(i) for i in ids if i in avg[b]})
                    if sub["n"]:
                        out["comparisons"][name][f"{b} − {a} [트랙 {group}]"] = sub
    for key, p in data.get("pairs", {}).items():
        other = key.split("|")[1].split("_")[1]
        d = out["pairwise"].setdefault(f"ttalkak vs {other}", {"ttalkak": 0, other: 0, "tie": 0})
        d["ttalkak" if p["winner"] == "b" else (other if p["winner"] == "a" else "tie")] += 1
    return out


def print_report(rep: dict) -> None:
    f = lambda x: "-" if x is None else (f"{x:+.3f}" if isinstance(x, float) else str(x))
    print("\n" + "═" * 72)
    print("  되묻기(결과물 없음) 비율: " + ", ".join(
        f"{c} {v['asked']}/{v['n']}" for c, v in rep["ask_rate"].items()))
    for name, comps in rep["comparisons"].items():
        print(f"\n  ■ {name}")
        for label, s in comps.items():
            ci = s["ci95"]
            ci_s = f"[{ci[0]:+.3f}, {ci[1]:+.3f}]" if ci else "(n<2)"
            print(f"    {label:<24} n={s['n']:<3} 평균 {f(s['mean_a'])[1:] if s['mean_a'] is not None else '-'}"
                  f" → {f(s['mean_b'])[1:] if s['mean_b'] is not None else '-'}  차이 {f(s['mean_diff'])} 95%CI {ci_s}"
                  f"  승/무/패 {s['wins']}/{s['ties']}/{s['losses']}  p={f(s['sign_p'])}")
        spread = rep["within_spread"].get(name, {})
        if spread:
            print("    반복 간 흔들림(문항 평균 최대−최소): " + ", ".join(f"{c} {f(v)}" for c, v in spread.items()))
    if rep["pairwise"]:
        print("\n  ■ 트랙 B 쌍대 선호(순서 바꿔 2회 일치해야 승부)")
        for k, d in rep["pairwise"].items():
            print(f"    {k}: {d}")
    print("═" * 72)


def main():
    ap = argparse.ArgumentParser(description="결과 상향 채점기 — raw / rewrite / ttalkak 결과물 비교")
    ap.add_argument("--set", default="uplift_set_v2.json")
    ap.add_argument("--items", default="", help="문항 id 쉼표 구분(비우면 전체)")
    ap.add_argument("--track", default="", choices=["", "A", "B"], help="트랙만 고르기(A=조건 충분·망치지 않는가)")
    ap.add_argument("--conditions", default=",".join(CONDITIONS))
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--gen-model", default="gemini-2.0-flash",
                    help="딸각 생성기 모델 별칭 — 운영 /query 기본값과 같게(Groq 에선 gpt-oss-120b 로 매핑)")
    ap.add_argument("--target-model", default="openai/gpt-oss-20b", help="결과물 실행 모델(세 조건 공통, Groq)")
    ap.add_argument("--judge-model", default="openai/gpt-oss-120b", help="판정 모델 — 결함 판정을 검증한 모델")
    ap.add_argument("--skip-pairwise", action="store_true")
    ap.add_argument("--max-wait", type=float, default=6 * 3600, help="429 누적 대기 상한(초)")
    ap.add_argument("--out", default="", help="결과 파일(기본 eval/results/uplift_<날짜>.json)")
    ap.add_argument("--dry-run", action="store_true", help="호출 수·토큰 추정만")
    ap.add_argument("--report", default="", help="저장된 결과 파일로 보고서만 출력")
    args = ap.parse_args()
    args.conditions = [c for c in args.conditions.split(",") if c]
    assert set(args.conditions) <= set(CONDITIONS), args.conditions

    items_all = json.loads((_DIR / args.set).read_text(encoding="utf-8"))["items"]
    by_id = {it["id"]: it for it in items_all}
    if args.report:
        data = json.loads(Path(args.report).read_text(encoding="utf-8"))
        print_report(report(data, by_id))
        return
    items = [by_id[i] for i in args.items.split(",")] if args.items else items_all
    if args.track:
        items = [it for it in items if it["track"] == args.track]

    est = estimate(items, args.conditions, args.repeats)
    print(f"문항 {len(items)} × 조건 {len(args.conditions)} × 반복 {args.repeats}")
    print("  호출 수: " + ", ".join(f"{k} {v}" for k, v in est["calls"].items()))
    print(f"  토큰 추정: 약 {est['total_tokens']:,} (무료 하루 한도 {TPD_FREE:,} 기준 약 "
          f"{est['total_tokens'] / TPD_FREE:.1f}일 — 생성·판정이 같은 모델이면)")
    if args.dry_run:
        return

    out = Path(args.out or _DIR / "results" / f"uplift_{datetime.date.today():%Y%m%d}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {"records": {}, "pairs": {}, "runs": []}
    data["runs"].append({**provenance(), "args": {k: v for k, v in vars(args).items() if k not in ("dry_run", "report")}})
    run(args, items, data, out)
    print_report(report(data, by_id))
    print(f"결과 파일: {out}")


if __name__ == "__main__":
    main()
