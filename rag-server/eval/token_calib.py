"""
eval/token_calib.py
────────────────────────────────────────────────────────────
생성기 입력 토큰 추정기(`generator._est_tokens`) 보정 측정.

`_fit_max_tokens` 는 `TPM − 추정입력 − 여유` 로 출력 예약을 잡는다. 추정이 크면 출력 예약이
괜히 깎이고(gpt-oss 는 그 예약을 추론 토큰이 먼저 먹어 JSON 을 못 끝내고 400),
추정이 작으면 입력+예약이 TPM 을 넘어 413 이 난다. 둘 다 실패라 **실측과 맞아야** 한다.

측정: 운영과 같은 messages(`GroqGenerator.build_messages` — 검색·예시·분석 블록 포함)를
`openai/gpt-oss-20b` 에 max_tokens 소량으로 보내 `usage.prompt_tokens` 만 읽는다.
120b 와 토크나이저(o200k_harmony)·대화 템플릿이 같고 쿼터는 따로라 생성기 쿼터를 안 쓴다.

사용:
  python -m eval.token_calib --items 1,2,4,6,8,14,15,17 --out calib.json
  python -m eval.token_calib --recheck calib.json      # 저장된 messages 로 현 추정기만 재검증(API 없음)
  python -m eval.token_calib --corpus --out corpus.json # 고정 입력(코퍼스 전량) 보정 계수 검증
"""

import argparse
import json
import re
import time
from pathlib import Path

from groq import Groq

from app.core.timeouts import GEN_SECONDS
from app.main import QueryRequest, retrieve_contexts
from app.rag import analyzer
from app.rag.generator import (SYSTEM_PROMPT, GroqGenerator, _build_context_blocks,
                               _est_known_tokens, _est_tokens)

_MODEL = "openai/gpt-oss-20b"


_WAIT_RE = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s")


def _prompt_tokens(client: Groq, messages: list[dict]) -> int:
    """429 는 서버 권고 시간만큼 기다렸다 재시도(하루 한도 TPD 도 포함 — 최대 20분씩 8회)."""
    for attempt in range(8):
        try:
            r = client.chat.completions.create(model=_MODEL, messages=messages, max_tokens=64,
                                               reasoning_effort="low", temperature=0)
            return r.usage.prompt_tokens
        except Exception as e:
            if "429" not in str(e) or attempt == 7:
                raise
            m = _WAIT_RE.search(str(e))
            wait = (int(m.group(1) or 0) * 60 + float(m.group(2)) + 5) if m else 30
            print(f"    429 — {min(wait, 1200):.0f}초 대기", flush=True)
            time.sleep(min(wait, 1200))
    raise RuntimeError("unreachable")


def _recheck(rows: list[dict]) -> None:
    """현 `_est_tokens` 가 저장된 실측을 과소추정하지 않는지 + 되찾는 출력 예산."""
    worst = None
    for r in rows:
        if "query" in r:        # 운영과 같은 출처별 추정(estimate_input)으로 재검증
            est = GroqGenerator.estimate_input(r["query"], r["contexts"], [], r["analysis"])
        elif len(r["messages"]) == 1:   # SYSTEM_PROMPT 단독 행
            est = _est_known_tokens(r["messages"][0]["content"]) + 100
        else:
            print(f"  {str(r['item']):>13}  (구형 저장본 — 원재료가 없어 건너뜀)")
            continue
        budget = GroqGenerator._fit_max_tokens("openai/gpt-oss-120b", r["messages"], 4096, est_input=est)
        room = GroqGenerator.TPM_LIMIT["openai/gpt-oss-120b"] - r["actual"]   # 무료 티어 기준
        margin = est - r["actual"]
        worst = margin if worst is None else min(worst, margin)
        print(f"  {str(r['item']):>13}  est={est:>5}  actual={r['actual']:>5}  여유={margin:>+5}  "
              f"예산={budget:>5}  (실제 한계 {room})")
    print(f"  최소 여유 {worst:+d} — 음수면 과소추정(413 위험)")


def _corpus(client: Groq, sleep: float, start: int = 0, out: str | None = None) -> list[dict]:
    """코퍼스 전량(층 필터 이전 기법 카드 + 예시)을 운영과 같은 렌더(`_build_context_blocks`)로
    묶음마다 실측해 `_est_known_tokens` 가 과소추정하지 않는지 본다. 고정 입력 계수의 근거."""
    from app.main import retriever
    retriever.use_layer_filter = False          # 지금 검색 대상이 아닌 카드도 언젠가 들어올 수 있다
    def ctx(rows):
        return [{"text": r["document"], "metadata": r["metadata"] or {}} for r in rows]
    techs = ctx(retriever._load_collection("prompt_techniques"))
    exs = ctx(retriever._load_collection("prompt_examples"))
    groups = [("기법", techs[i:i + 5]) for i in range(0, len(techs), 5)]
    groups += [("예시", exs[i:i + 4]) for i in range(0, len(exs), 4)]
    overhead = _prompt_tokens(client, [{"role": "user", "content": "a"}]) - 1   # 대화 템플릿
    rows = json.loads(Path(out).read_text(encoding="utf-8")) if (out and start and Path(out).exists()) else []
    for gi, (kind, g) in enumerate(groups):
        if gi < start:
            continue
        block = _build_context_blocks(g)
        actual = _prompt_tokens(client, [{"role": "user", "content": block}]) - overhead
        est = _est_known_tokens(block)
        rows.append({"group": gi, "kind": kind, "n": len(g), "est": est, "actual": actual})
        if out:                                   # 묶음마다 저장 — 한도로 끊겨도 --start 로 이어간다
            Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  [{gi:>2}] {kind} ×{len(g)}  est={est:>5}  actual={actual:>5}  여유={est - actual:+5} "
              f"({est / actual - 1:+.0%})", flush=True)
        time.sleep(sleep)
    worst = min(rows, key=lambda r: r["est"] / r["actual"])
    print(f"  최악 묶음: {worst['kind']} est/actual={worst['est'] / worst['actual']:.3f} "
          f"— 1 미만이면 _KNOWN_HANGUL 을 올려야 한다 · 템플릿 오버헤드 {overhead}")
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="생성기 입력 토큰 추정기 보정")
    ap.add_argument("--qa", default="gen_set.json")
    ap.add_argument("--items", default="1,2,4,6,8,14,15,17")
    ap.add_argument("--sleep", type=float, default=65.0, help="TPM 8000 — 입력 ~6k 요청 사이 대기")
    ap.add_argument("--out", default=None)
    ap.add_argument("--recheck", default=None, help="저장된 측정 JSON 을 현 추정기로 재검증(API 없음)")
    ap.add_argument("--corpus", action="store_true", help="코퍼스 전량으로 고정 입력 계수 검증")
    ap.add_argument("--start", type=int, default=0, help="--corpus 이어가기: 이 묶음 번호부터(--out 에 누적)")
    args = ap.parse_args()

    if args.recheck:
        _recheck(json.loads(Path(args.recheck).read_text(encoding="utf-8")))
        return

    import os
    client = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=GEN_SECONDS)
    if args.corpus:
        _corpus(client, sleep=12.0, start=args.start, out=args.out)
        return

    data = json.loads((Path(__file__).parent / args.qa).read_text(encoding="utf-8"))
    rows = []

    sys_only = [{"role": "system", "content": SYSTEM_PROMPT}]
    actual = _prompt_tokens(client, sys_only)
    rows.append({"item": "SYSTEM_PROMPT", "est": _est_tokens(SYSTEM_PROMPT), "actual": actual,
                 "messages": sys_only})
    print(f"  SYSTEM_PROMPT  est={rows[-1]['est']:>5}  actual={actual:>5}", flush=True)
    time.sleep(args.sleep / 2)

    for n in [int(x) for x in args.items.split(",") if x.strip()]:
        q = data["items"][n - 1]["query"]
        ret, ex = retrieve_contexts(QueryRequest(query=q, collection_name=data.get("collection", "prompt_techniques")))
        analysis = analyzer.analyze(q, [])
        msgs = GroqGenerator.build_messages(q, ret + ex, [], analysis)
        est = GroqGenerator.estimate_input(q, ret + ex, [], analysis)   # 운영 generate() 와 같은 추정
        actual = _prompt_tokens(client, msgs)
        budget_now = GroqGenerator._fit_max_tokens("openai/gpt-oss-120b", msgs, 4096, est_input=est)
        rows.append({"item": n, "est": est, "actual": actual, "budget_now": budget_now,
                     "chars": sum(len(m["content"]) for m in msgs),
                     "messages": msgs,    # 계수를 바꿀 때 API 없이 재검증하려고 원재료째 저장
                     "query": q, "contexts": ret + ex, "analysis": analysis})
        print(f"  [{n:>2}] est={est:>5}  actual={actual:>5}  ratio={actual/est:.3f}  "
              f"예산={budget_now}  분석={'O' if analysis else 'X'}", flush=True)
        time.sleep(args.sleep)

    if args.out:
        Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
