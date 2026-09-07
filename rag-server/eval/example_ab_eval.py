"""
eval/example_ab_eval.py
────────────────────────────────────────────────────────────
A안 검증 — '개선 예시(prompt_examples)' 주입이 딸각 개선 프롬프트의 **결과물**을
실제로 더 좋게 만드는가를 **헤드투헤드**로 측정한다.

왜 헤드투헤드인가:
  uplift_eval 의 vs-raw 는 '딸각이 raw 보다 나은가'를 보지만, 강한 실행모델에선
  프롬프트 엔지니어링 한계효용이 작아(=raw 도 이미 잘함) 신호가 약하다(WORKLOG 2026-06-26).
  여기서는 raw 를 빼고 **기법만 개선안 vs 기법+예시 개선안**을 직접 맞붙여, 오직 '예시를
  넣었는가' 한 변수의 효과만 격리한다.

흐름 (한 항목 = 거친 요청 1개):
  ① 검색: 기법 top5(prompt_techniques) + 예시 top-N(prompt_examples)
  ② 개선안 2종: gen_tech(기법만) / gen_ex(기법+예시)  ← 운영 run_generation 재사용
  ③ 결과물 2종: 각 개선 프롬프트를 '순수 LLM'(중립 시스템)으로 실행 → out_tech / out_ex
  ④ Judge: 같은 원 요청 기준 out_tech vs out_ex 비교. 순서 swap 2회로 위치 편향 제거.
  ⑤ 집계: 예시 승률(ex/tie/tech) + 평균 점수 Δ.

공정성: 두 개선안은 같은 검색 기법 top5 를 공유하고, 차이는 '예시 N개 추가' 하나뿐.
둘 다 같은 실행모델·같은 판정. ask 모드(개선안 없음)는 비교에서 제외.

사용법 (rag-server/ 에서. Groq 소진 시 GROQ_API_KEY= 로 Gemini 강제):
    GROQ_API_KEY= python -m eval.example_ab_eval \
        --gen-model gemini-flash-latest --target-model gemini-flash-latest \
        --judge-model gemini-flash-latest --examples 2 --show
"""

import argparse
import time
from pathlib import Path

from app.main import retriever, run_generation
from eval.uplift_eval import (
    _pick_backend, _BACKEND_DEFAULT_MODEL, _complete, _judge_pair, _resolve,
    _num, _NEUTRAL_SYSTEM, _retry, _load_cache, _save_cache, _ckey,
)


def main():
    ap = argparse.ArgumentParser(
        description="A안 헤드투헤드 — 기법만 vs 기법+예시 개선안의 결과물 A/B")
    ap.add_argument("--qa", default="uplift_set.json", help="평가셋(eval/ 기준) — 거친 요청 모음")
    ap.add_argument("--collection", default="prompt_techniques", help="기법 컬렉션")
    ap.add_argument("--ex-collection", default="prompt_examples", help="개선 예시 컬렉션")
    ap.add_argument("--examples", type=int, default=2, metavar="N", help="주입할 예시 수(기본 2)")
    ap.add_argument("--limit", type=int, default=0, help="앞 N개만(0=전체)")
    ap.add_argument("--gen-model", default="gemini-flash-latest", help="딸각 개선안 생성 모델")
    ap.add_argument("--target-model", default=None, help="결과물 실행 모델(공통). 기본=백엔드 기본")
    ap.add_argument("--judge-model", default=None, help="채점 모델. 기본=백엔드 기본")
    ap.add_argument("--no-swap", action="store_true", help="순서 1회만(비용 절반)")
    ap.add_argument("--sleep", type=float, default=4.0, help="항목 간 대기(초) — RPM 회피")
    ap.add_argument("--show", action="store_true", help="개선안·결과·근거 상세 출력")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--cache-file", default="eval/.example_ab_cache.json")
    args = ap.parse_args()

    backend = _pick_backend()
    target_model = args.target_model or _BACKEND_DEFAULT_MODEL[backend]
    judge_model  = args.judge_model  or _BACKEND_DEFAULT_MODEL[backend]
    cache_path = None if args.no_cache else args.cache_file
    cache = _load_cache(cache_path)

    qa_path = Path(__file__).parent / args.qa
    import json
    data = json.loads(qa_path.read_text(encoding="utf-8"))
    items = data["items"]
    if args.limit:
        items = items[:args.limit]

    print(f"A안 헤드투헤드: {args.qa} ({len(items)}개)  예시 {args.examples}개 주입")
    print(f"  백엔드={backend}  생성={args.gen_model}  실행={target_model}  채점={judge_model}  "
          f"swap={'off' if args.no_swap else 'on'}")

    def _exec(prompt: str) -> str:
        key = _ckey(target_model, _NEUTRAL_SYSTEM, prompt)
        if cache_path and key in cache:
            return cache[key]
        out = _retry(lambda: _complete(backend, target_model, _NEUTRAL_SYSTEM, prompt,
                                       max_tokens=1024))
        if cache_path:
            cache[key] = out
            _save_cache(cache, cache_path)
        return out

    wins = {"tech": 0, "ex": 0, "tie": 0}
    tech_scores, ex_scores = [], []
    skipped = 0

    for i, it in enumerate(items, 1):
        task = it["query"]

        techs = retriever.search(query=task, collection_name=args.collection, top_k=5)
        exs   = retriever.search(query=task, collection_name=args.ex_collection,
                                 top_k=args.examples)

        gen_tech = _retry(lambda: run_generation(task, techs, args.gen_model, []))
        gen_ex   = _retry(lambda: run_generation(task, techs + exs, args.gen_model, []))
        p_tech, p_ex = gen_tech["improved_prompt"], gen_ex["improved_prompt"]

        if not p_tech or not p_ex:
            skipped += 1
            print(f"  [{i:>2}] ⏭  ask 모드(개선안 없음) → 제외 | {task[:34]}")
            if args.sleep and i < len(items):
                time.sleep(args.sleep)
            continue

        out_tech, out_ex = _exec(p_tech), _exec(p_ex)

        # judge: base_pos=1 슬롯에 tech, 2 슬롯에 ex → _resolve 의 baseline=tech / improved=ex
        v1 = _retry(lambda: _judge_pair(backend, judge_model, task, out_tech, out_ex))
        r1, t1, e1 = _resolve(v1, base_pos=1)   # r1 in {baseline(=tech), improved(=ex), tie}
        if args.no_swap:
            win_raw, t_sc, e_sc = r1, _num(t1), _num(e1)
        else:
            v2 = _retry(lambda: _judge_pair(backend, judge_model, task, out_ex, out_tech))
            r2, e2, t2 = _resolve(v2, base_pos=1)  # 2차: 1슬롯=ex → baseline(=ex),improved(=tech)
            # r1 은 tech/ex 관점, r2 는 ex/tech 관점 → 공통 축(예시 우위)으로 환산
            ex_win1 = r1 == "improved"
            ex_win2 = r2 == "baseline"   # 2차에서 ex 가 1슬롯(baseline)
            tech_win1 = r1 == "baseline"
            tech_win2 = r2 == "improved"
            if ex_win1 and ex_win2:
                win_raw = "improved"
            elif tech_win1 and tech_win2:
                win_raw = "baseline"
            else:
                win_raw = "tie"
            t_sc = _num(t1) if _num(t2) is None else (_num(t2) if _num(t1) is None else (_num(t1)+_num(t2))/2)
            e_sc = _num(e1) if _num(e2) is None else (_num(e2) if _num(e1) is None else (_num(e1)+_num(e2))/2)

        win = {"improved": "ex", "baseline": "tech", "tie": "tie"}[win_raw]
        wins[win] += 1
        if t_sc is not None:
            tech_scores.append(t_sc)
        if e_sc is not None:
            ex_scores.append(e_sc)

        mark = {"ex": "✅ 예시 승", "tech": "❌ 기법만 승", "tie": "➖ 무승부"}[win]
        ts = f"{t_sc:.1f}" if t_sc is not None else "-"
        es = f"{e_sc:.1f}" if e_sc is not None else "-"
        print(f"  [{i:>2}] {mark}  기법={ts} vs 예시={es}  | {task[:34]}")
        if args.show:
            print(f"       개선안(기법): {p_tech[:120].replace(chr(10),' ')}")
            print(f"       개선안(예시): {p_ex[:120].replace(chr(10),' ')}")
            print(f"       근거: {v1.get('reason','')}")

        if args.sleep and i < len(items):
            time.sleep(args.sleep)

    judged = wins["tech"] + wins["ex"] + wins["tie"]
    print("\n" + "═" * 56)
    print(f"  A안 헤드투헤드 — 비교 {judged}개"
          + (f", ask모드 제외 {skipped}개" if skipped else ""))
    print("─" * 56)
    if judged:
        print(f"  예시 승률   : {wins['ex']/judged:.1%}  "
              f"(예시 {wins['ex']} / 무 {wins['tie']} / 기법만 {wins['tech']})")
    if tech_scores and ex_scores:
        t_avg = sum(tech_scores) / len(tech_scores)
        e_avg = sum(ex_scores) / len(ex_scores)
        d = e_avg - t_avg
        print(f"  평균 점수   : 기법만 {t_avg:.2f} → 예시 {e_avg:.2f}  (Δ {d:+.2f})")
    print("═" * 56)


if __name__ == "__main__":
    main()
