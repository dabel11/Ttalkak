"""
eval/run_multi_turn_eval.py
────────────────────────────────────────────────────────────
다중 턴 프롬프트 개선 평가 러너 — RAG가 **도움이 된 경우와 방해가 된 경우**를 가른다.

multi_turn_eval.py 는 운영 코드를 import 하지 않는 순수 평가 로직이다(테스트 가능).
운영 의존(app.main 검색·생성, LLM SDK)은 **이 러너에만** 둔다.

세 조건을 같은 항목에 대해 돌린다. 차이는 '어떤 근거를 넣었는가' 하나뿐이다:
  ① rag_off  : 컨텍스트 없음                  → 기준선
  ② rag_on   : 운영과 동일한 검색(기법+예시)  → 실제 검색
  ③ oracle   : 데이터셋의 gold_techniques 주입 → 이상적 근거(상한)

산출:
  retrieval_help_rate / harm_rate / neutral_rate  ①vs② judge 점수 변화
  utility_recovery(UR)                            (②−①)/(③−①), 근거 민감 항목만
  distract / rescue                               mode 판정이 뒤집힌 비율

⚠️ 검색은 **한 번만 돌려 캐시에 고정**한다. 매번 다시 검색하면 조건 간 점수 차이에
   '그날 검색이 흔들린 정도'가 섞여 도움/방해 판정이 무의미해진다.

사용법 (rag-server/ 에서. GROQ_API_KEY 또는 GEMINI_API_KEY 필요):
    python3 -m eval.run_multi_turn_eval
    python3 -m eval.run_multi_turn_eval --limit 2 --show
    python3 -m eval.run_multi_turn_eval --runs 3            # tau를 반복측정에서 산출
    python3 -m eval.run_multi_turn_eval --conditions rag_off,rag_on   # 오라클 생략
    python3 -m eval.run_multi_turn_eval --tau 0.5           # tau 직접 지정

비용: 항목당 생성 = 조건 수 × runs, judge = 같은 수. 10항목·3조건·1run = 생성 30 + judge 30.
캐시가 기본 ON 이라 재실행 시 추가 호출은 0이다.
"""

import argparse
import json
import time
from pathlib import Path

from sqlalchemy import text

from app.core.db import get_engine
from app.main import retriever, run_generation, extract_improved_prompt
from app.rag.generator import SYSTEM_PROMPT
from app.rag import query_transform
# 운영 LLM 클라이언트는 uplift_eval 의 것을 재사용한다(백엔드 선택·키 처리 동일).
from eval.uplift_eval import _pick_backend, _complete

from eval.multi_turn_eval import (
    load_dataset,
    load_cache,
    run_evaluation_item,
    get_judge_average_score,
    estimate_tau,
    calculate_retrieval_effect_rates,
    calculate_retrieval_effect_rates_by_category,
    calculate_utility_recovery,
    calculate_distract_rescue_rates,
    DEFAULT_MINIMUM_TAU,
)


CONDITIONS = ("rag_off", "rag_on", "oracle")

# uplift_eval._BACKEND_DEFAULT_MODEL 의 gemini-2.0-flash 는 퇴역해 404 가 난다.
# 그 파일은 수정 대상이 아니므로 러너에서 자체 기본값을 쓴다.
_JUDGE_DEFAULT_MODEL = {
    "groq": "llama-3.3-70b-versatile",
    "gemini": "gemini-flash-latest",
}

_JUDGE_SYSTEM = (
    "너는 다중 턴 프롬프트 개선 결과를 채점하는 엄격하고 일관된 평가자다. "
    "반드시 요청된 JSON 형식으로만 응답한다."
)


def make_judge_call(backend: str):
    """multi_turn_eval 에 주입할 judge 호출 함수를 만든다.

    평가 로직 쪽에 SDK 를 노출하지 않도록 (prompt, model) 인터페이스로 감싼다.
    """
    def judge_call(prompt: str, model: str) -> str:
        return _complete(
            backend=backend,
            model=model,
            system=_JUDGE_SYSTEM,
            user=prompt,
            max_tokens=1024,
            temperature=0.0,  # 채점은 결정론에 가깝게
        )

    return judge_call


def fetch_gold_contexts(technique_names: list[str]) -> list[dict]:
    """정답 기법 카드를 코퍼스에서 이름으로 직접 꺼낸다(검색을 거치지 않는다)."""
    if not technique_names:
        return []

    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                "SELECT document, `metadata` FROM rag_chunk "
                "WHERE collection_name = :collection"
            ),
            {"collection": "prompt_techniques"},
        ).fetchall()

    wanted = set(technique_names)
    contexts = []

    for document, raw_metadata in rows:
        metadata = raw_metadata
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        metadata = metadata or {}

        name = metadata.get("technique") or metadata.get("source")
        if name and str(name) in wanted:
            # 운영 retriever 와 같은 형식(text/metadata/score)이어야
            # generator 가 그대로 렌더할 수 있다. score 1.0 = 이상적 근거.
            contexts.append(
                {"text": document, "metadata": metadata, "score": 1.0}
            )

    found = {
        str(c["metadata"].get("technique") or c["metadata"].get("source"))
        for c in contexts
    }
    if wanted - found:
        raise SystemExit(f"코퍼스에 없는 gold 기법: {sorted(wanted - found)}")

    return contexts


def build_condition_kwargs(condition: str, item: dict) -> dict:
    """조건별로 '어떤 근거를 넣을지'만 다르게 한다."""
    if condition == "rag_off":
        return {"use_retrieval": False}

    if condition == "oracle":
        return {
            "override_contexts": fetch_gold_contexts(
                item.get("gold_techniques", [])
            )
        }

    return {}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="다중 턴 평가 — RAG 도움/방해 분리 측정"
    )
    parser.add_argument("--dataset", default="eval/multi_turn_set.json")
    parser.add_argument("--limit", type=int, default=0, help="앞 N개만(0=전체)")
    parser.add_argument(
        "--conditions",
        default=",".join(CONDITIONS),
        help=f"쉼표 구분. 가능: {','.join(CONDITIONS)}",
    )
    parser.add_argument("--runs", type=int, default=1,
                        help="조건별 반복 실행 수. 2 이상이면 tau를 흔들림에서 산출")
    parser.add_argument("--model", default="gemini-flash-latest", help="생성 모델")
    parser.add_argument("--judge-model", default=None, help="채점 모델(기본=백엔드 기본)")
    parser.add_argument("--temperature", default="0.7")
    parser.add_argument("--tau", type=float, default=None,
                        help="판정 임계값 직접 지정. 미지정 시 --runs로 산출")
    parser.add_argument("--sleep", type=float, default=2.0, help="호출 간 대기(초)")
    parser.add_argument("--max-attempts", type=int, default=5,
                        help="생성·채점 재시도 횟수(429/5xx)")
    parser.add_argument("--base-delay", type=float, default=6.0,
                        help="재시도 지수 백오프 기준 대기(초)")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--cache-file", default="eval/.multi_turn_gen_cache.json")
    parser.add_argument("--judge-cache-file", default="eval/.multi_turn_judge_cache.json")
    parser.add_argument(
        "--retrieval-cache-file", default="eval/.multi_turn_retrieval_cache.json"
    )
    parser.add_argument("--out", default=None, help="결과 JSON 저장 경로")
    parser.add_argument("--show", action="store_true", help="항목별 상세 출력")
    args = parser.parse_args()

    conditions = [c.strip() for c in args.conditions.split(",") if c.strip()]
    unknown = [c for c in conditions if c not in CONDITIONS]
    if unknown:
        raise SystemExit(f"알 수 없는 조건: {unknown}")

    backend = _pick_backend()
    judge_model = args.judge_model or _JUDGE_DEFAULT_MODEL[backend]
    judge_call = make_judge_call(backend)

    dataset = load_dataset(args.dataset)
    items = dataset["items"][: args.limit] if args.limit else dataset["items"]

    cache_path = None if args.no_cache else args.cache_file
    judge_cache_path = None if args.no_cache else args.judge_cache_file
    retrieval_cache_path = None if args.no_cache else args.retrieval_cache_file

    cache = load_cache(cache_path)
    judge_cache = load_cache(judge_cache_path)
    retrieval_cache = load_cache(retrieval_cache_path)

    print(f"[multi_turn] 백엔드={backend} 생성={args.model} 채점={judge_model}")
    print(f"[multi_turn] 항목={len(items)} 조건={conditions} runs={args.runs}")

    # run_index → condition → item_id → 평가 결과
    executions: dict[int, dict[str, dict]] = {}

    for run_index in range(args.runs):
        executions[run_index] = {condition: {} for condition in conditions}

        # 반복은 tau(점수 흔들림) 산출에만 쓰므로 2회차부터는 rag_on 만 돈다.
        # 전 조건을 반복하면 호출이 조건 수만큼 배로 늘어나 쿼터를 태운다.
        run_conditions = (
            conditions
            if run_index == 0
            else [c for c in conditions if c == "rag_on"]
        )

        for item in items:
            for condition in run_conditions:
                # 반복 실행은 캐시를 우회해야 흔들림이 관측된다.
                run_cache = cache if run_index == 0 else {}
                run_judge_cache = judge_cache if run_index == 0 else {}

                result = run_evaluation_item(
                    item=item,
                    retriever=retriever,
                    query_transform_module=query_transform,
                    run_generation=run_generation,
                    extract_improved_prompt=extract_improved_prompt,
                    cache=run_cache,
                    cache_path=cache_path if run_index == 0 else None,
                    model=args.model,
                    temperature=args.temperature,
                    # 운영 SYSTEM_PROMPT 를 캐시 키에 반영해야 프롬프트를 바꾼 뒤
                    # 예전 생성 결과가 조용히 재사용되지 않는다.
                    system_prompt=SYSTEM_PROMPT,
                    judge_call=judge_call,
                    judge_cache=run_judge_cache,
                    judge_cache_path=judge_cache_path if run_index == 0 else None,
                    judge_model=judge_model,
                    judge_max_attempts=args.max_attempts,
                    judge_base_delay_seconds=args.base_delay,
                    generation_max_attempts=args.max_attempts,
                    generation_base_delay_seconds=args.base_delay,
                    # 검색은 run 과 무관하게 고정한다.
                    retrieval_cache=retrieval_cache,
                    retrieval_cache_path=retrieval_cache_path,
                    **build_condition_kwargs(condition, item),
                )

                executions[run_index][condition][item["id"]] = result

                if args.show:
                    score = get_judge_average_score(result)
                    print(
                        f"  run{run_index} {condition:8s} {item['id']:24s} "
                        f"mode={result['generation'].get('mode'):7s} "
                        f"judge={score}"
                    )

                if args.sleep:
                    time.sleep(args.sleep)

    if "rag_off" not in conditions or "rag_on" not in conditions:
        raise SystemExit("도움/방해 판정에는 rag_off 와 rag_on 이 모두 필요합니다.")

    records = []
    for item in items:
        record = {
            "item": item,
            "baseline": executions[0]["rag_off"][item["id"]],
            "retrieval": executions[0]["rag_on"][item["id"]],
        }
        if "oracle" in conditions:
            record["oracle"] = executions[0]["oracle"][item["id"]]
        records.append(record)

    if args.tau is not None:
        tau = args.tau
        tau_source = "직접 지정"
    elif args.runs >= 2:
        repeated_scores = [
            [
                get_judge_average_score(
                    executions[run_index]["rag_on"][item["id"]]
                )
                for run_index in range(args.runs)
            ]
            for item in items
        ]
        tau = estimate_tau(repeated_scores)
        tau_source = f"{args.runs}회 반복측정"
    else:
        tau = DEFAULT_MINIMUM_TAU
        tau_source = "하한값(반복측정 없음)"

    summary = {
        "backend": backend,
        "model": args.model,
        "judgeModel": judge_model,
        "conditions": conditions,
        "runs": args.runs,
        "itemCount": len(items),
        "tau": tau,
        "tauSource": tau_source,
        "overall": calculate_retrieval_effect_rates(records, tau),
        "byCategory": calculate_retrieval_effect_rates_by_category(records, tau),
        "distractRescue": calculate_distract_rescue_rates(records),
    }

    if "oracle" in conditions:
        summary["utilityRecovery"] = calculate_utility_recovery(records)

    print_summary(summary)

    if args.out:
        Path(args.out).write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\n결과 저장: {args.out}")


def _percent(value) -> str:
    return "—" if value is None else f"{value * 100:5.1f}%"


def print_summary(summary: dict) -> None:
    overall = summary["overall"]

    print("\n" + "=" * 60)
    print(f"다중 턴 RAG 효과 — 항목 {summary['itemCount']}개")
    print(f"tau = {summary['tau']:.3f} ({summary['tauSource']})")
    print("=" * 60)

    print(f"  help    {_percent(overall['retrievalHelpRate'])}   "
          f"harm    {_percent(overall['retrievalHarmRate'])}   "
          f"neutral {_percent(overall['retrievalNeutralRate'])}")
    print(f"  invalid {_percent(overall['invalidRate'])}   "
          f"평균 Δ  {overall['meanDelta']}")

    print("\n  category별 (전체 평균은 반대 방향을 상쇄한다)")
    for category, rates in summary["byCategory"].items():
        print(f"    {category:20s} help {_percent(rates['retrievalHelpRate'])}"
              f"  harm {_percent(rates['retrievalHarmRate'])}"
              f"  Δ {rates['meanDelta']}")

    distract = summary["distractRescue"]
    print(f"\n  mode 판정  distract {_percent(distract['distractRate'])}"
          f"  rescue {_percent(distract['rescueRate'])}"
          f"  NRI {distract['netRescueIndex']}")

    if "utilityRecovery" in summary:
        recovery = summary["utilityRecovery"]
        print(f"\n  UR(오라클 대비 회수율) {recovery['utilityRecovery']}"
              f"  (근거 민감 {recovery['evidenceSensitiveCount']}"
              f"/{recovery['total']})")


if __name__ == "__main__":
    main()
