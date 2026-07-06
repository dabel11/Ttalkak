"""
eval/uplift_eval.py
────────────────────────────────────────────────────────────
결과 상향(uplift) 평가 — 딸각의 '실제 효용'을 end-to-end A/B로 측정한다.

run_eval.py = 검색(R) 품질, gen_eval.py = 개선 프롬프트(지시문) 품질만 본다.
이 도구는 그 위 질문에 답한다:
  "딸각이 만든 개선 프롬프트로 실제 결과물이, 사용자가 거친 프롬프트를
   그냥 LLM에 넣었을 때보다 얼마나 더 좋아지는가?"

흐름 (한 항목 = 거친 사용자 요청 1개):
  ① Baseline(A): 거친 프롬프트 → '순수 LLM'(딸각 시스템프롬프트 없음) → 결과물 A
  ② Treatment(B): 거친 프롬프트 → 딸각 RAG 파이프라인(검색+생성) → 개선 프롬프트
                  → 같은 '순수 LLM' → 결과물 B
  ③ Judge LLM 이 A vs B 를 비교. **순위 편향 제거**를 위해 순서를 바꿔 2회 채점
     (1차: A,B / 2차: B,A). 양쪽 모두에서 이겨야 'win', 엇갈리면 'tie'.
  ④ 집계: 개선 승률(win/tie/loss) + 평균 점수(1~5) 차이 Δ(상향 정도).

★ 공정성: Baseline 과 Treatment 는 **같은 실행 모델(--target-model)**·같은 작업으로
  결과물을 만든다. 차이는 오직 '프롬프트가 딸각을 거쳤는가' 하나다.

사용법 (rag-server/ 에서 실행, GROQ_API_KEY 또는 GEMINI_API_KEY 필요):
    python -m eval.uplift_eval
    python -m eval.uplift_eval --limit 4 --show
    python -m eval.uplift_eval --no-swap            # 순서 1회만(비용 절반, 편향 보정 약화)
    python -m eval.uplift_eval --target-model llama-3.1-8b-instant
    python -m eval.uplift_eval --no-cache           # 캐시 끄기(매번 재생성)

⚠️ 무료 티어 한도: 항목당 LLM 호출 = 딸각1 + baseline1 + improved1 + judge(1~2).
   기본은 결과물 캐시 ON(eval/.uplift_cache.json) → 재실행 시 judge만 다시 돈다.
"""

import argparse
import hashlib
import json
import os
import re
import time
from pathlib import Path

# 운영과 동일한 파이프라인(검색·생성·개선프롬프트 추출)을 그대로 재사용
from app.main import retriever, generator, extract_improved_prompt, run_generation


# ── 실행/채점용 '순수 LLM' (딸각 시스템프롬프트 없음) ────────────
# 딸각의 Generator 는 항상 '프롬프트를 만드는' 시스템프롬프트를 입혀서, 작업 결과물을
# 직접 만들지 못한다. A/B 결과물을 얻으려면 시스템프롬프트 없는 호출이 필요하다.

_NEUTRAL_SYSTEM = "너는 유능한 한국어 AI 어시스턴트다. 사용자의 요청을 충실히 수행해 결과물을 직접 만들어라."

# 백엔드별 기본 모델 (gen_eval/generator 와 동일 계열)
_BACKEND_DEFAULT_MODEL = {
    "groq":   "llama-3.3-70b-versatile",
    "gemini": "gemini-2.0-flash",
}

_client_cache: dict[str, object] = {}


def _pick_backend() -> str:
    """GROQ 우선(generator 와 동일 규칙), 없으면 Gemini."""
    if os.environ.get("GROQ_API_KEY"):
        return "groq"
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    raise EnvironmentError("GROQ_API_KEY 또는 GEMINI_API_KEY 가 필요합니다.")


def _get_client(backend: str):
    if backend in _client_cache:
        return _client_cache[backend]
    if backend == "groq":
        from groq import Groq
        c = Groq(api_key=os.environ["GROQ_API_KEY"])
    else:
        from google import genai
        c = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    _client_cache[backend] = c
    return c


def _complete(backend: str, model: str, system: str, user: str,
              max_tokens: int = 1024, temperature: float = 0.7) -> str:
    """시스템프롬프트 없는(또는 중립) 순수 LLM 1회 호출."""
    client = _get_client(backend)
    if backend == "groq":
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system},
                      {"role": "user",   "content": user}],
            max_tokens=max_tokens, temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()
    else:
        from google.genai import types
        prompt = f"{system}\n\n{user}" if system else user
        resp = client.models.generate_content(
            model=model, contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=max_tokens, temperature=temperature),
        )
        return (resp.text or "").strip()


# ── 429 재시도 / 캐시 (gen_eval 패턴 재사용) ──────────────────
def _retry(fn, tries: int = 4, base: float = 9.0):
    for attempt in range(tries):
        try:
            return fn()
        except Exception as e:
            if "429" in str(e) or "rate_limit" in str(e):
                if attempt == tries - 1:
                    raise
                wait = base * (attempt + 1)
                print(f"       (429 — {wait:.0f}s 대기 후 재시도 {attempt + 1}/{tries - 1})")
                time.sleep(wait)
            else:
                raise


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
    if path:
        Path(path).write_text(json.dumps(cache, ensure_ascii=False, indent=2),
                              encoding="utf-8")


def _ckey(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:20]


def _loads_loose(s: str) -> dict:
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


# ── Judge ────────────────────────────────────────────────────
_JUDGE_SYSTEM = """너는 두 AI 결과물의 품질을 비교하는 엄격하고 공정한 평가자다.
같은 사용자 요청에 대한 두 결과물 [1]과 [2]를 받는다. 어느 쪽이 딸각/AI가 만든
것인지는 모른다. 오직 '사용자 요청을 얼마나 잘 충족했는가'로만 판단하라.

평가 기준(종합):
  - 요구 충실도: 요청의 모든 항목·제약(주제·형식·톤·분량·필수정보)을 반영했나
  - 구체성·실용성: 두루뭉술하지 않고 바로 쓸 수 있을 만큼 구체적인가
  - 구조·가독성: 형식이 적절하고 정리돼 있나
  - 정확성: 사실/논리 오류나 빠진 부분이 없나

각 결과물에 1~5 정수 점수를 매기고(5=매우 우수), 종합 우열을 고른다.
편향 금지: 길다고 좋은 게 아니다. 동률이면 "tie".

반드시 아래 JSON 한 개만 출력(설명 금지):
{"score_1": <1-5>, "score_2": <1-5>, "winner": "1"|"2"|"tie", "reason": "<한 줄 근거>"}"""


def _judge_pair(backend: str, model: str, task: str, out1: str, out2: str) -> dict:
    user = (
        f"[사용자 요청]\n{task}\n\n"
        f"[결과물 1]\n{out1}\n\n"
        f"[결과물 2]\n{out2}"
    )
    raw = _complete(backend, model, _JUDGE_SYSTEM, user,
                    max_tokens=300, temperature=0.0)
    return _loads_loose(raw)


def _resolve(verdict: dict, base_pos: int) -> tuple[str, float, float]:
    """판정(JSON)을 baseline/improved 기준으로 환산.
    base_pos: baseline 이 들어간 자리(1 또는 2).
    반환: (winner in {'baseline','improved','tie'}, baseline_score, improved_score)
    """
    s1, s2 = verdict.get("score_1"), verdict.get("score_2")
    w = str(verdict.get("winner", "tie")).strip().lower()
    if base_pos == 1:
        b_score, i_score = s1, s2
        win = "baseline" if w == "1" else ("improved" if w == "2" else "tie")
    else:
        b_score, i_score = s2, s1
        win = "baseline" if w == "2" else ("improved" if w == "1" else "tie")
    return win, b_score, i_score


def _num(v):
    return v if isinstance(v, (int, float)) else None


def main():
    ap = argparse.ArgumentParser(
        description="딸각 결과 상향(uplift) 평가 — raw vs 개선프롬프트 결과물 A/B")
    ap.add_argument("--qa", default="uplift_set.json", help="평가셋 파일명 (eval/ 기준)")
    ap.add_argument("--limit", type=int, default=0, help="앞 N개만 (0=전체)")
    ap.add_argument("--gen-model", default="gemini-2.0-flash",
                    help="딸각 개선프롬프트 생성 모델(Generator 가 백엔드로 매핑)")
    ap.add_argument("--target-model", default=None,
                    help="결과물 실행 LLM(baseline·improved 공통). 기본=백엔드 기본모델")
    ap.add_argument("--judge-model", default=None,
                    help="채점 LLM. 기본=백엔드 기본모델")
    ap.add_argument("--no-swap", action="store_true",
                    help="순서 1회만 채점(비용 절반, 위치 편향 보정 약화)")
    ap.add_argument("--sleep", type=float, default=5.0,
                    help="항목 간 대기(초) — 무료 티어 TPM 회피")
    ap.add_argument("--show", action="store_true", help="결과물·점수 상세 출력")
    ap.add_argument("--no-cache", action="store_true", help="결과물 캐시 비활성화")
    ap.add_argument("--cache-file", default="eval/.uplift_cache.json",
                    help="결과물 캐시 JSON 경로")
    args = ap.parse_args()

    backend = _pick_backend()
    target_model = args.target_model or _BACKEND_DEFAULT_MODEL[backend]
    judge_model  = args.judge_model  or _BACKEND_DEFAULT_MODEL[backend]
    cache_path = None if args.no_cache else args.cache_file
    cache = _load_cache(cache_path)

    qa_path = Path(__file__).parent / args.qa
    data = json.loads(qa_path.read_text(encoding="utf-8"))
    items = data["items"]
    if args.limit:
        items = items[:args.limit]
    collection = data.get("collection", "prompt_techniques")

    print(f"결과 상향 평가셋: {args.qa}  ({len(items)}개, 컬렉션 {collection})")
    print(f"  백엔드={backend}  실행모델={target_model}  채점={judge_model}  "
          f"swap={'off' if args.no_swap else 'on'}  "
          f"캐시={'off' if args.no_cache else cache_path}")

    wins = {"baseline": 0, "improved": 0, "tie": 0}
    base_scores, impr_scores = [], []
    skipped = 0  # 딸각이 질문(ask)모드로 빠져 개선프롬프트가 없는 경우

    for i, it in enumerate(items, 1):
        task = it["query"]

        # ── ① 딸각 파이프라인 → 개선 프롬프트 ──
        retrieved = retriever.search(query=task, collection_name=collection, top_k=5)
        # 운영과 동일 경로(JSON 구조화 + 폴백)
        gen = _retry(lambda: run_generation(task, retrieved, args.gen_model, []))
        improved_prompt = gen["improved_prompt"]

        if not improved_prompt:
            skipped += 1
            print(f"  [{i:>2}] ⏭  ask 모드(개선프롬프트 없음) → uplift 비교 제외  | {task[:30]}")
            if args.sleep and i < len(items):
                time.sleep(args.sleep)
            continue

        # ── ② baseline / improved 결과물 (캐시 사용) ──
        def _gen(prompt: str) -> str:
            key = _ckey(target_model, _NEUTRAL_SYSTEM, prompt)
            if cache_path and key in cache:
                return cache[key]
            out = _retry(lambda: _complete(backend, target_model,
                                           _NEUTRAL_SYSTEM, prompt, max_tokens=1024))
            if cache_path:
                cache[key] = out
                _save_cache(cache, cache_path)
            return out

        out_base = _gen(task)             # 딸각 안 거친 거친 프롬프트
        out_impr = _gen(improved_prompt)  # 딸각이 개선한 프롬프트

        # ── ③ judge (순서 swap 2회로 위치 편향 제거) ──
        v1 = _retry(lambda: _judge_pair(backend, judge_model, task, out_base, out_impr))
        win1, b1, i1 = _resolve(v1, base_pos=1)

        if args.no_swap:
            win, b_sc, i_sc = win1, _num(b1), _num(i1)
        else:
            v2 = _retry(lambda: _judge_pair(backend, judge_model, task, out_impr, out_base))
            win2, b2, i2 = _resolve(v2, base_pos=2)
            # 두 패스 일치해야 승부 인정, 엇갈리면 tie
            win = win1 if win1 == win2 else "tie"
            b_sc = _num(b1) if _num(b2) is None else (
                _num(b2) if _num(b1) is None else (_num(b1) + _num(b2)) / 2)
            i_sc = _num(i1) if _num(i2) is None else (
                _num(i2) if _num(i1) is None else (_num(i1) + _num(i2)) / 2)

        wins[win] += 1
        if b_sc is not None:
            base_scores.append(b_sc)
        if i_sc is not None:
            impr_scores.append(i_sc)

        mark = {"improved": "✅ 개선 승", "baseline": "❌ raw 승", "tie": "➖ 무승부"}[win]
        bs = f"{b_sc:.1f}" if b_sc is not None else "-"
        is_ = f"{i_sc:.1f}" if i_sc is not None else "-"
        print(f"  [{i:>2}] {mark}  raw={bs} → 개선={is_}  | {task[:34]}")
        if args.show:
            print(f"       개선프롬프트: {improved_prompt[:140].replace(chr(10),' ')}")
            print(f"       raw 결과 : {out_base[:120].replace(chr(10),' ')}")
            print(f"       개선 결과: {out_impr[:120].replace(chr(10),' ')}")
            print(f"       근거: {v1.get('reason','')}")

        if args.sleep and i < len(items):
            time.sleep(args.sleep)

    # ── ④ 집계 ──
    judged = wins["baseline"] + wins["improved"] + wins["tie"]
    print("\n" + "═" * 56)
    print(f"  결과 상향(uplift) — 비교 {judged}개"
          + (f", ask모드 제외 {skipped}개" if skipped else ""))
    print("─" * 56)
    if judged:
        wr = wins["improved"] / judged
        print(f"  개선 승률   : {wr:.1%}  "
              f"(개선 {wins['improved']} / 무 {wins['tie']} / raw {wins['baseline']})")
    if base_scores and impr_scores:
        b_avg = sum(base_scores) / len(base_scores)
        i_avg = sum(impr_scores) / len(impr_scores)
        delta = i_avg - b_avg
        pct = (delta / b_avg * 100) if b_avg else 0.0
        print(f"  평균 점수   : raw {b_avg:.2f} → 개선 {i_avg:.2f}  "
              f"(Δ +{delta:.2f}, {pct:+.0f}%)" if delta >= 0
              else f"  평균 점수   : raw {b_avg:.2f} → 개선 {i_avg:.2f}  (Δ {delta:.2f}, {pct:+.0f}%)")
    print("═" * 56)


if __name__ == "__main__":
    main()
