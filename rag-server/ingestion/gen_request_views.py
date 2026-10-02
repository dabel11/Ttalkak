"""
ingestion/gen_request_views.py
────────────────────────────────────────────────────────────
문서측 요청 예문 생성 (doc2query / HyPE) — 기법 카드마다 "이 기법이 필요한
**사용자 말투 한국어 요청**" 을 오프라인으로 만든다.

왜 (WORKLOG 2026-08-09 「근본 원인 규명」):
  기법 카드(정의체 + 영문 스캐폴딩)는 거친 한국어 작업지시와 다른 표현 공간에 있다.
  정상/무관 입력 분리 AUC 0.575(무작위 수준). 같은 임베딩으로 사용자 말투 코퍼스
  (`prompt_examples`)는 AUC 1.000. → 간극을 **문서 쪽**에서 메운다.
  쿼리 쪽(HyDE)은 이미 실패했다(R@5 0.763→0.441).

산출물은 DB 에 쓰지 않는다. `ingestion/request_views.json` 에 저장만 한다.
  - 사람이 검수할 수 있고, 재생성 없이 재사용된다(쿼리당 비용 0).
  - 효과 측정: `python -m eval.doc2query_eval` (메모리에서만 뷰를 붙여 A/B)
  - 적용(벡터 적재)은 측정 후 별도 결정.

★ 어휘 누수 방어 (gen_qa_set 과 같은 위험):
  카드를 보고 요청을 만들면 카드 어휘가 새어 든다. 그러면 검색이 '표면'으로 맞는다.
    ① 프롬프트가 기법명·카드 표현을 금지하고 '방법' 대신 '상황'을 쓰게 한다.
    ② 기법명이 들어간 요청은 코드로 버린다.
    ③ leak_score 를 요청마다 기록한다(0.5 이상은 버림).

⚠️ 평가 오염: `qa_set_coverage.json` 도 카드 → 사용자 요청을 LLM 으로 만든 셋이다
   (gen_qa_set, gpt-oss-120b). 이 스크립트는 **다른 모델(20b)·다른 프롬프트**를 쓰지만
   그래도 커버리지셋 수치는 부풀 수 있다. 1차 판단은 사람 라벨 `qa_set_realistic` 으로.

사용법 (rag-server/ 에서):
    python -m ingestion.gen_request_views --limit 5 --dry-run   # 프롬프트·첫 배치만
    python -m ingestion.gen_request_views                        # 전량(이어 실행 가능)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.core.timeouts import GEN_SECONDS  # noqa: E402
from app.rag.layers import is_searchable  # noqa: E402
from eval.gen_qa_set import leak_score  # noqa: E402
from eval.uplift_eval import _retry_wait_hint  # noqa: E402

OUT_PATH = Path(__file__).parent / "request_views.json"

_MODEL = "openai/gpt-oss-20b"   # 120b 는 평가(judge)와 하루 한도를 공유 → 피한다
_TEMPERATURE = 0.8              # 요청은 다양해야 한다
_MAX_TOKENS = 4000              # gpt-oss 는 추론 토큰을 먼저 쓴다(analyzer 700 → 400 전례)
_PER_CARD = 5
_BATCH = 5                      # 카드 N장을 한 호출에 — 지시문 토큰을 나눠 낸다
_LEAK_MAX = 0.5


def build_prompt(cards: list[dict]) -> str:
    blocks = "\n\n".join(f"<card id=\"{c['id']}\">\n{c['document']}\n</card>" for c in cards)
    return f"""너는 프롬프트 개선 서비스의 검색 색인을 만든다.

각 [기법 카드]마다, 그 기법이 **특히 도움이 되는 상황**에서 실제 사용자가
서비스 입력창에 칠 법한 요청을 {_PER_CARD}개씩 만들어라.

[사용자]
프롬프트 기법을 전혀 모른다. 자기 일을 시키려는 것뿐이다. 입력은 대개 거칠고 짧다.
실제 입력 예(소재·말투 참고용, 그대로 쓰지 마라):
- 자기소개서 써줘
- 신제품 무선 이어폰 소개 글 써줘
- 이 회의록 핵심만 3줄로 요약해줘
- 파이썬 함수 코드리뷰 해줘
- 고객 환불 요청 거절하는 이메일 써줘. 구매 7일 지나서 안 됨

[규칙 — 어기면 색인이 망가진다]
1. 기법 이름(카드 제목의 단어)을 쓰지 마라.
2. 카드의 표현을 베끼지 마라. 기법이 말하는 '방법'이 아니라, 그 방법이
   필요해지는 **작업과 상황**을 써라.
   나쁜 예: "단계별로 생각해서 풀어줘"   좋은 예: "택배비 합계 계산 문제 풀어줘"
3. {_PER_CARD}개는 서로 다른 분야여야 한다(업무·학업·개발·마케팅·일상 등).
4. 길이를 섞어라: 2개는 15자 이하의 짧은 요청, 3개는 조건이 붙은 40자 내외 요청.
5. 다른 기법보다 **이 기법이 더 필요한** 요청이어야 한다. "글 써줘" 같은
   어느 기법에나 해당하는 요청은 만들지 마라.
6. 한국어. 존댓말/반말 섞어도 된다.

[출력 — JSON 하나만]
{{"cards": [{{"id": "카드 id", "requests": ["요청1", "요청2", "요청3", "요청4", "요청5"]}}]}}

{blocks}"""


def make_groq_call(model: str):
    from groq import Groq
    if not os.environ.get("GROQ_API_KEY"):
        raise SystemExit("GROQ_API_KEY 가 필요합니다.")
    client = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=GEN_SECONDS)

    def call(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model, temperature=_TEMPERATURE, max_tokens=_MAX_TOKENS,
            reasoning_effort="low",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or "{}"
    return call


def parse_batch(raw: str) -> dict[str, list[str]]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    out: dict[str, list[str]] = {}
    for card in (data.get("cards") or []) if isinstance(data, dict) else []:
        if not isinstance(card, dict):
            continue
        reqs = [str(r).strip() for r in (card.get("requests") or []) if str(r).strip()]
        if card.get("id") and reqs:
            out[str(card["id"])] = reqs
    return out


def _name_tokens(technique: str) -> list[str]:
    """기법명에서 요청에 나오면 안 되는 단어(영문 3자↑·한글 2자↑)."""
    return [t for t in re.findall(r"[A-Za-z]{3,}|[가-힣]{2,}", technique)
            if t.lower() not in {"prompt", "prompting", "the", "and", "with"}]


def clean_requests(requests: list[str], card: dict) -> list[dict]:
    """기법명 포함·누수 과다 요청을 버리고 leak 을 기록한다."""
    names = [t.lower() for t in _name_tokens(card["technique"])]
    kept = []
    for q in requests:
        if any(n in q.lower() for n in names):
            continue
        leak = round(leak_score(q, card["document"]), 3)
        if leak >= _LEAK_MAX:
            continue
        kept.append({"q": q, "leak": leak})
    return kept


def load_cards() -> list[dict]:
    from sqlalchemy import select
    from app.core.db import SessionLocal, RagChunk
    with SessionLocal() as s:
        rows = s.execute(
            select(RagChunk.document, RagChunk.chunk_metadata)
            .where(RagChunk.collection_name == "prompt_techniques")
            .order_by(RagChunk.id)
        ).all()
    cards = []
    for doc, meta in rows:
        meta = meta or {}
        if not is_searchable({"metadata": meta}):
            continue
        cards.append({"id": meta.get("chunk_id"), "document": doc,
                      "technique": meta.get("technique") or ""})
    return cards


def call_with_retry(call, prompt: str, tries: int = 8):
    for attempt in range(tries):
        try:
            return call(prompt)
        except Exception as e:
            msg = str(e)
            limited = "429" in msg or "rate_limit" in msg
            transient = limited or "timeout" in msg.lower() or "connection" in msg.lower()
            if not transient or attempt == tries - 1:
                raise
            hint = _retry_wait_hint(msg)
            wait = min(300, (hint + 2) if hint else 15 * (attempt + 1))
            print(f"   ({'429' if limited else '연결'} — {wait:.0f}s 대기 {attempt + 1}/{tries - 1})",
                  flush=True)
            time.sleep(wait)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=_MODEL)
    ap.add_argument("--limit", type=int, default=0, help="앞 N장만 (0=전체)")
    ap.add_argument("--dry-run", action="store_true", help="첫 배치만 생성해 출력, 저장 안 함")
    args = ap.parse_args()

    cards = load_cards()
    if args.limit:
        cards = cards[:args.limit]

    store = json.loads(OUT_PATH.read_text(encoding="utf-8")) if OUT_PATH.exists() else {}
    views = store.setdefault("views", {})
    store["generatedBy"] = {"model": args.model, "temperature": _TEMPERATURE,
                            "perCard": _PER_CARD, "leakMax": _LEAK_MAX,
                            "script": "ingestion/gen_request_views.py"}

    todo = [c for c in cards if c["id"] not in views]
    print(f"[gen_request_views] 대상 {len(cards)}장 · 남은 {len(todo)}장 · 모델 {args.model}",
          flush=True)
    call = make_groq_call(args.model)

    for i in range(0, len(todo), _BATCH):
        batch = todo[i:i + _BATCH]
        got = parse_batch(call_with_retry(call, build_prompt(batch)))
        for card in batch:
            reqs = got.get(card["id"])
            if not reqs:
                print(f"   ! {card['id']} 응답 없음 — 다음 실행에서 재시도", flush=True)
                continue
            kept = clean_requests(reqs, card)
            views[card["id"]] = {"technique": card["technique"], "requests": kept,
                                 "dropped": len(reqs) - len(kept)}
        done = sum(1 for c in cards if c["id"] in views)
        print(f"   {done}/{len(cards)}  (+{len(batch)})", flush=True)

        if args.dry_run:
            for card in batch:
                print(json.dumps(views.get(card["id"]), ensure_ascii=False, indent=1))
            return
        OUT_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")

    n_req = sum(len(v["requests"]) for v in views.values())
    n_drop = sum(v["dropped"] for v in views.values())
    print(f"[gen_request_views] 완료 {len(views)}장 · 요청 {n_req}개 · 버림 {n_drop}개 → {OUT_PATH}")


if __name__ == "__main__":
    main()
