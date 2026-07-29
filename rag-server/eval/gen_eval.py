"""
eval/gen_eval.py
────────────────────────────────────────────────────────────
생성(G) 품질 평가 — RAG의 'G'를 LLM-as-judge로 채점한다.
(run_eval.py 는 검색만 측정. 딸각의 실제 가치인 'improved_prompt' 품질은 여기서 측정)

흐름: gen_set.json 의 거친 사용자 프롬프트마다
  ① 운영과 동일한 파이프라인으로 검색 + 생성 (app.main 의 retriever/generator 재사용)
  ② extract_improved_prompt 로 모드 판정 (개선 블록 있으면 improve, 없으면 ask)
  ③ 별도 LLM(judge)이 4개 기준을 1~5로 채점

채점 기준:
  mode_fit            — 모드 선택이 적절한가 (정보 부족→질문 / 충분→개선)
  technique_grounding — 검색된 기법을 실제로 반영했나 (질문 모드면 질문이 기법 관점에서 타당)
  instruction_form    — [개선 모드만] improved_prompt 가 'AI에게 시키는 지시문'이고
                        결과물을 직접 쓰지 않았나. 질문 모드면 N/A(null)
  intent_preservation — 원래 요청의 의도를 유지했나
  faithfulness        — [개선 모드만] 사용자가 안 준 '구체 사실'을 지어냈나(환각). 정상 가정
                        (대상·톤·분량 등 보조항목)은 감점 아님. + fabricated(bool)로 환각률 집계

판정 모드 vs expected_mode 일치율도 함께 보고한다.

사용법 (rag-server/ 에서 실행, GROQ_API_KEY 필요):
    python -m eval.gen_eval
    python -m eval.gen_eval --qa gen_set.json --limit 4 --show
    python -m eval.gen_eval --judge-model llama-3.3-70b-versatile
    python -m eval.gen_eval --cache-file eval/.gen_cache.json   # 캐시 활성화(재평가 비용↓)
"""

import argparse
import hashlib
import json
import os
import re
import time
from pathlib import Path

from app.main import retriever, generator, extract_improved_prompt, run_generation
from app.rag.generator import SYSTEM_PROMPT


# ── 응답 캐시 (Groq 무료 TPD 100k 절약) ────────────────────────
# 캐시 키 = sha256(생성모델 + temperature + SYSTEM_PROMPT + query + sorted 기법명) —
# 검색 결과·시스템 프롬프트·모델·온도가 바뀌면 자동 무효화. 같은 조건이면 LLM 호출 스킵.
# (모델 미포함 시 8b 실험 응답이 70b 측정으로 오인되는 사고가 실제 있었음 — 2026-07-09.
#  temperature 도 같은 이유로 포함 — 온도 비교 실험 캐시가 서로 오염되지 않게. 2026-07-23)

def _cache_key(query: str, technique_names: list[str], model: str = "",
               temperature: str = "") -> str:
    payload = (str(model) + "|t" + str(temperature) + "|" + SYSTEM_PROMPT + "|"
               + query + "|" + str(sorted(technique_names)))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def _load_cache(path: str | None) -> dict:
    if not path:
        return {}
    p = Path(path)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict, path: str | None) -> None:
    if not path:
        return
    Path(path).write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def _retry(fn, tries: int = 4, base: float = 9.0):
    """무료 티어 TPM(429) 대응 — 429면 점증 대기 후 재시도. 그 외 예외는 즉시 전파.
    단 '요청 자체가 너무 큼'(413)은 기다려도 안 풀리므로 즉시 실패."""
    for attempt in range(tries):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if "Request too large" in msg or "reduce your message size" in msg:
                raise
            if "429" in msg or "rate_limit" in msg:
                if attempt == tries - 1:
                    raise
                wait = base * (attempt + 1)
                print(f"       (429 — {wait:.0f}s 대기 후 재시도 {attempt + 1}/{tries - 1})")
                time.sleep(wait)
            else:
                raise

_JUDGE_MODEL = "llama-3.3-70b-versatile"

_JUDGE_SYSTEM = """너는 '프롬프트 개선 어시스턴트'의 응답을 채점하는 엄격한 평가자다.
이 어시스턴트(딸각)는 사용자의 거친 프롬프트를 받아, 결과물을 직접 쓰지 않고
'다른 AI에게 작업을 시키는 개선된 프롬프트(지시문)'를 만들어 주는 도구다.
정보가 부족하면 먼저 질문(ask 모드)하고, 충분하면 개선안(improve 모드)을 낸다.

아래 입력을 보고 각 항목을 1~5 정수로 채점하라(5=매우 좋음, 1=매우 나쁨).

[mode_fit] 모드 선택이 적절한가? (관대하게 주지 마라 — '안전하게 묻기'를 후하게 보지 말 것)
  - 사용자가 이미 핵심 정보(주제·구체 데이터·형식/톤)를 제공했는데도 추가 질문을 하면
    이는 '과잉 질문'이다 → mode_fit 을 2 이하로.
  - 핵심 정보가 실제로 부족(예: "글 써줘")한데 개선안을 냈으면 낮게.
  - 부족할 때 적절히 질문했거나, 충분할 때 바로 개선안을 냈으면 높게.
[technique_grounding] 제공된 '검색된 기법'을 실제로 반영했나?
  - 개선 모드: 기법이 개선안에 녹아있나. 질문 모드: 질문이 기법 관점에서 타당한가.
[instruction_form] (개선 모드일 때만) improved_prompt 가 'AI에게 ~하라'는 지시문이고,
  결과물(예: 마케팅 글 자체)을 직접 작성하지 '않았'나? 질문 모드면 null.
[intent_preservation] 사용자의 원래 의도를 왜곡 없이 유지했나?
[faithfulness] (개선 모드일 때만) improved_prompt 가 사용자가 주지 않은 '구체적 사실'을 지어냈나?
  - 감점(환각): 사용자가 안 준 구체 날짜·가격·수치·고유명사·사건·제품 스펙·통계, 또는
    요약/번역/리뷰할 원문의 내용 자체를 창작. (없는 핵심 소재를 만들어낸 경우 특히 낮게)
  - 감점 아님(정상 가정): 대상 독자·톤·분량·페르소나 등 '보조 항목'을 합리적 기본값으로 가정하거나,
    사용자가 준 정보를 재표현한 것. → 이건 설계된 가정이지 환각이 아니다.
  - 5=지어낸 구체 사실 전혀 없음 … 1=핵심 사실을 여러 개 창작. 질문 모드면 null.
  - 함께 "fabricated": 구체 사실을 하나라도 지어냈으면 true, 아니면 false. (질문 모드면 false)

반드시 아래 JSON 한 개만 출력한다(설명 금지):
{"mode_fit": <1-5>, "technique_grounding": <1-5>, "instruction_form": <1-5 또는 null>, "intent_preservation": <1-5>, "faithfulness": <1-5 또는 null>, "fabricated": <true/false>, "reason": "<한 줄 근거>"}"""

_judge_client = None


def _get_judge():
    global _judge_client
    if _judge_client is None:
        from groq import Groq
        key = os.environ.get("GROQ_API_KEY")
        if not key:
            raise EnvironmentError("GROQ_API_KEY 가 필요합니다 (judge LLM).")
        _judge_client = Groq(api_key=key)
    return _judge_client


def _loads_loose(s: str) -> dict:
    """LLM 출력에서 첫 JSON 객체만 뽑아 파싱. 실패하면 빈 dict."""
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def _judge(query: str, techniques: list[str], answer: str,
           improved: str, mode: str, judge_model: str) -> dict:
    user = (
        f"[사용자 입력]\n{query}\n\n"
        f"[검색된 기법]\n{', '.join(techniques) if techniques else '(없음)'}\n\n"
        f"[판정된 모드]\n{mode}\n\n"
        f"[개선된 프롬프트 (improve 모드일 때만)]\n{improved or '(없음 — 질문 모드)'}\n\n"
        f"[어시스턴트 전체 응답]\n{answer}"
    )
    client = _get_judge()
    resp = client.chat.completions.create(
        model=judge_model,
        messages=[
            {"role": "system", "content": _JUDGE_SYSTEM},
            {"role": "user",   "content": user},
        ],
        max_tokens=300,
        temperature=0.0,
    )
    return _loads_loose(resp.choices[0].message.content or "")


def _avg(vals: list) -> float | None:
    nums = [v for v in vals if isinstance(v, (int, float))]
    return (sum(nums) / len(nums)) if nums else None


def main():
    ap = argparse.ArgumentParser(description="RAG 생성(G) 품질 평가 — LLM-as-judge")
    ap.add_argument("--qa", default="gen_set.json", help="평가셋 파일명 (eval/ 기준)")
    ap.add_argument("--limit", type=int, default=0, help="앞 N개만 (0=전체)")
    ap.add_argument("--items", default="", help="1-기준 항목 번호 선택 (예: 1,3,9) — limit 무시")
    ap.add_argument("--model", default="gemini-2.0-flash", help="생성 모델(딸각 응답용)")
    ap.add_argument("--judge-model", default=_JUDGE_MODEL, help="채점 LLM")
    ap.add_argument("--no-judge", action="store_true",
                    help="judge 생략 — 결정론 지표(mode_accuracy·structured)만 집계 (TPD 절약)")
    ap.add_argument("--sleep", type=float, default=5.0,
                    help="항목 간 대기(초) — 무료 티어 TPM 한도 회피")
    ap.add_argument("--show", action="store_true", help="항목별 응답·점수 상세 출력")
    ap.add_argument("--cache-file", default=None,
                    help="생성 응답 캐시 JSON 경로 (지정 시 동일 조건 재호출 스킵)")
    args = ap.parse_args()

    qa_path = Path(__file__).parent / args.qa
    data = json.loads(qa_path.read_text(encoding="utf-8"))
    items = data["items"]
    if args.items:
        picks = [int(x) for x in args.items.split(",") if x.strip()]
        items = [items[n - 1] for n in picks]
    elif args.limit:
        items = items[:args.limit]
    collection = data.get("collection", "prompt_techniques")
    cache = _load_cache(args.cache_file)
    cache_hits = 0
    temperature = os.environ.get("GEN_TEMPERATURE", "0.7")   # generator 와 동일 규약
    print(f"생성 평가셋: {args.qa}  (컬렉션 {collection}, {len(items)}개, "
          f"temp={temperature}, judge={'생략' if args.no_judge else args.judge_model})"
          + (f"  캐시: {args.cache_file} ({len(cache)}건)" if args.cache_file else ""))

    scores = {"mode_fit": [], "technique_grounding": [],
              "instruction_form": [], "intent_preservation": [], "faithfulness": []}
    mode_correct = 0
    mode_total = 0
    fabricated_n = 0      # 개선안이 없는 구체 사실을 지어낸 건수 (환각)
    fabricated_known = 0  # fabricated 판정이 있는 개선 모드 건수
    structured_n = 0     # 구조화 JSON 파싱 성공(정규식 폴백 미발동) 건수
    structured_known = 0  # structured 필드가 있는 건수(구형 캐시는 알 수 없음)

    for i, it in enumerate(items, 1):
        query = it["query"]
        expected = it.get("expected_mode")

        retrieved = retriever.search(query=query, collection_name=collection, top_k=5)
        techniques = [r["metadata"].get("technique") or r["metadata"].get("source", "")
                      for r in retrieved]

        ckey = _cache_key(query, techniques, args.model, temperature) if args.cache_file else None
        if ckey and ckey in cache:
            cached = cache[ckey]
            if isinstance(cached, dict):           # 신형 캐시: run_generation 결과 dict
                gen = cached
            else:                                  # 구형 캐시: 마크다운 문자열 → 레거시 추출
                gen = {"answer": cached, "improved_prompt": extract_improved_prompt(cached)}
            cache_hits += 1
            print(f"  [{i:>2}] [캐시 히트]", end="  ")
        else:
            try:
                # 운영과 동일 경로(JSON 구조화 + 폴백) — /query 와 같은 run_generation 사용
                gen = _retry(lambda: run_generation(query, retrieved, args.model, []))
            except Exception as e:
                print(f"  [{i}] 생성 실패: {e}")
                continue
            if ckey:
                cache[ckey] = gen
                _save_cache(cache, args.cache_file)

        answer   = gen["answer"]
        improved = gen["improved_prompt"]
        mode = "improve" if improved else "ask"
        if expected:
            mode_total += 1
            mode_correct += 1 if mode == expected else 0
        if "structured" in gen:
            structured_known += 1
            structured_n += 1 if gen["structured"] else 0

        # judge 실패(TPD 소진 등)는 비치명 — mode_accuracy(결정론적)는 계속 집계
        if args.no_judge:
            verdict = {}
        else:
            try:
                verdict = _retry(lambda: _judge(query, techniques, answer, improved,
                                                mode, args.judge_model))
            except Exception as e:
                print(f"       (judge 실패 → 점수 없이 mode만 집계: {str(e)[:80]})")
                verdict = {}
        for k in scores:
            scores[k].append(verdict.get(k))
        # 환각률: 개선 모드에서 fabricated(bool) 판정이 있을 때만 집계
        if mode == "improve" and isinstance(verdict.get("fabricated"), bool):
            fabricated_known += 1
            fabricated_n += 1 if verdict["fabricated"] else 0

        tag = "" if not expected else (" ✓" if mode == expected else f" ✗(기대 {expected})")
        fab = verdict.get("fabricated")
        fab_mark = " 🚨지어냄" if fab is True else ""
        print(f"  [{i:>2}] mode={mode}{tag}  "
              f"fit={verdict.get('mode_fit')} tech={verdict.get('technique_grounding')} "
              f"form={verdict.get('instruction_form')} intent={verdict.get('intent_preservation')} "
              f"faith={verdict.get('faithfulness')}{fab_mark}  "
              f"| {query[:30]}")
        if args.show:
            print(f"       기법: {', '.join(t for t in techniques if t)}")
            print(f"       근거: {verdict.get('reason','')}")
            if improved:
                print(f"       개선안: {improved[:160].replace(chr(10),' ')}")

        if args.sleep and i < len(items):
            time.sleep(args.sleep)

    n = len(items)
    print("\n" + "═" * 52)
    if args.cache_file:
        print(f"  캐시 히트: {cache_hits}/{n}  (신규 API 호출: {n - cache_hits}건)")
    print(f"  생성 품질 (1~5 평균, {n}개)")
    print("─" * 52)
    for k in scores:
        a = _avg(scores[k])
        cnt = len([v for v in scores[k] if isinstance(v, (int, float))])
        print(f"  {k:<20}: {a:.2f}  (n={cnt})" if a is not None else f"  {k:<20}: N/A")
    if mode_total:
        print(f"  {'mode_accuracy':<20}: {mode_correct/mode_total:.2f}  ({mode_correct}/{mode_total})")
    if fabricated_known:
        rate = fabricated_n / fabricated_known
        print(f"  {'환각률(fabricated)':<18}: {rate:.2f}  ({fabricated_n}/{fabricated_known} 개선안이 없는 사실 창작)")
    if structured_known:
        print(f"  {'structured(JSON)':<20}: {structured_n}/{structured_known}  (정규식 폴백 {structured_known - structured_n}회)")
    print("═" * 52)


if __name__ == "__main__":
    main()
