"""
eval/gen_qa_set.py
────────────────────────────────────────────────────────────
커버리지 평가셋 생성 — 아직 어떤 평가 문항도 겨냥하지 않는 카드에 대해
'실제 사용자가 칠 법한 작업 요청'을 만든다.

왜 필요한가 (WORKLOG 2026-09-13 「평가셋 정합성 점검」):
  `qa_set_realistic` 의 정답은 코퍼스 170장 중 **63장(37%)** 만 가리킨다.
  검색 대상 130장 중 **74장이 한 번도 측정되지 않는다** — 지금까지의 모든 검색
  수치는 코퍼스의 37% 만 본 값이다.

★ 이 스크립트의 핵심 위험 — **어휘 누수**
  카드를 보고 질의를 만들면 카드의 어휘가 질의에 새어 들어간다. 그러면 검색이
  '의미'가 아니라 '어휘 중첩'으로 맞히고 점수가 **부풀려진다.** 2026-08-15 진단이
  이미 그 상태를 관측했다 — *"현재 맞히는 케이스는 전부 어휘 중첩이다"*.
  같은 함정이 `min_score=0.40` 을 망쳤다(측정 분포 ≠ 운영 분포).

  방어 2겹:
    ① 생성 프롬프트가 기법명·카드 표현 사용을 금지하고, 운영 분포(gen_set·
       uplift_set 의 일반 작업 요청)를 말투 기준으로 준다.
    ② 생성 후 `leak_score()` 로 질의↔카드 어휘 중첩을 **측정**해 상위를 표시한다.
       사람이 그 목록만 봐도 누수 질의를 걷어낼 수 있다.

⚠️ 산출물은 **단일 정답(single-gold)** 이다 — 질의 1개당 그 카드 1장. 실제로는
   다른 카드도 적절할 수 있으므로 Recall 이 **과소평가**될 수 있다. 사람 검토로
   공동 정답을 추가할 것.

⚠️ 라벨은 LLM 생성이다. `qa_set_realistic` 의 사람 라벨과 **같은 급이 아니다.**
   두 셋의 수치를 직접 비교하지 말고 각각의 추이로 볼 것.

사용법 (rag-server/ 에서):
    python3 -m eval.gen_qa_set --limit 5 --dry-run     # 미리보기
    python3 -m eval.gen_qa_set --out eval/qa_set_coverage.json
    python3 -m eval.gen_qa_set --leak-report eval/qa_set_coverage.json  # 누수 점검만
"""

import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ⏱️ LLM 호출 타임아웃 — app/core/timeouts.py 가 단일 출처.
# 2026-09-13 에 운영 경로(app/rag/*)만 고쳤더니 측정 도구 11곳이 그대로 남아 있었고,
# 그 탓에 gen_eval 이 judge 응답을 기다리며 **5시간 42분을 멈춰** 있었다(캐시 13/18 에서
# 2시간 9분간 무진전, ESTABLISHED 소켓 4개 점유). 예외가 안 나므로 _retry 도 못 잡는다.
from app.core.timeouts import GEN_SECONDS
from app.rag.layers import is_searchable  # noqa: E402

_MODEL = "openai/gpt-oss-120b"
_TEMPERATURE = 0.7    # 질의는 다양해야 한다. 결정성보다 분포가 중요.
_MAX_TOKENS = 1500    # gpt-oss 는 추론 토큰을 먼저 쓴다(tag_layers 실측)

_TOKEN_RE = re.compile(r"[a-zA-Z]+|[0-9]+|[가-힣]+")
# 어느 카드에나 있는 흔한 말 — 누수 점수에서 뺀다(변별력 없음)
_STOP = {"프롬프트", "모델", "사용자", "요청", "작성", "답변", "출력", "지시", "내용",
         "결과", "제시", "포함", "사용", "수행", "정보", "하라", "해줘", "하고", "있는"}


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text) if len(t) > 1} - _STOP


def leak_score(query: str, card_text: str) -> float:
    """질의가 카드 어휘를 얼마나 베꼈는가 (0~1).

    질의 토큰 중 카드에도 등장하는 비율. 높을수록 '의미'가 아니라 '표면'으로
    맞을 위험이 크다. 0.5 이상은 사람이 직접 볼 것.
    """
    q = _tokens(query)
    if not q:
        return 0.0
    return len(q & _tokens(card_text)) / len(q)


def build_query_prompt(card_text: str) -> str:
    """카드 하나에 대해 '그 기법이 도움이 될 사용자 작업 요청'을 만드는 프롬프트."""
    return f"""너는 프롬프트 개선 서비스의 평가셋을 만든다.

아래 [기법 카드]가 **도움이 될 만한 상황**에서, 실제 사용자가 칠 법한
**작업 요청 한 문장**을 만들어라.

[사용자는 이런 사람이다]
프롬프트 기법을 전혀 모른다. 자기 일을 시키려고 할 뿐이다.
말투 예시(소재를 베끼지 말고 **말투만** 참고):
- 제주도 여행 블로그 글 써줘
- 고객 환불 요청을 정중하게 거절하는 이메일 써줘
- 이 회의록을 핵심만 3줄로 요약해줘
- 신입 백엔드 개발자 채용 공고 써줘

[반드시 지켜라 — 어기면 평가셋이 망가진다]
1. **기법 이름을 쓰지 마라.** 카드 제목의 단어를 질의에 넣지 마라.
2. **카드의 표현을 베끼지 마라.** 카드가 설명하는 '방법'을 말하지 말고,
   그 방법이 필요해지는 **상황**을 써라.
   나쁜 예: "단계별로 생각해서 풀어줘"  (기법을 그대로 말함)
   좋은 예: "이 물류 배송비 계산 문제 풀어줘"  (기법이 필요한 상황)
3. 구체적인 소재를 넣어라. "글 써줘" 같은 맨몸 요청은 만들지 마라.
4. 한국어 한 문장. 40자 내외.

[출력 — JSON 하나만]
{{"query": "사용자 요청 한 문장", "why": "이 기법이 왜 도움이 되는지 한 줄"}}

[기법 카드]
{card_text}"""


def make_groq_generator(model: str = _MODEL):
    from groq import Groq
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SystemExit("GROQ_API_KEY 가 필요합니다.")
    client = Groq(api_key=api_key, timeout=GEN_SECONDS)

    def call(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model, temperature=_TEMPERATURE, max_tokens=_MAX_TOKENS,
            reasoning_effort="low",   # gpt-oss 추론 토큰 절감(gen_eval judge 전례)
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or "{}"
    return call


def parse_query_result(raw: str) -> tuple[str, str]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    return str(data.get("query") or "").strip(), str(data.get("why") or "").strip()


def is_rate_limited(error: Exception) -> bool:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status is None:
        status = getattr(getattr(error, "response", None), "status_code", None)
    try:
        if int(status) in {429, 500, 502, 503, 504}:
            return True
    except (TypeError, ValueError):
        pass
    return "rate limit" in str(error).lower()


def generate(cards: list[dict], call, max_attempts: int = 4,
             base_delay_seconds: float = 20.0, sleep_fn=time.sleep,
             progress=None) -> list[dict]:
    """카드별 질의 생성. 실패는 query="" 로 남긴다(조용히 버리지 않는다)."""
    out = []
    for i, card in enumerate(cards):
        query, why, error = "", "", None
        for attempt in range(max_attempts):
            try:
                query, why = parse_query_result(call(build_query_prompt(card["document"])))
                error = None
                break
            except Exception as exc:                    # noqa: BLE001
                error = exc
                if not is_rate_limited(exc) or attempt == max_attempts - 1:
                    break
                sleep_fn(base_delay_seconds * (2 ** attempt))
        item = {
            "query": query,
            "relevant": [str(card["metadata"].get("chunk_id"))],
            "technique": card["technique"],
            "why": why,
            "leak": round(leak_score(query, card["document"]), 3) if query else None,
            "error": str(error) if error else None,
        }
        out.append(item)
        if progress:
            progress(i + 1, len(cards), item)
    return out


def uncovered_cards(cards: list[dict], covered: set[str]) -> list[dict]:
    """검색 대상이면서 아직 어떤 평가 문항의 정답도 아닌 카드."""
    return [c for c in cards
            if is_searchable(c) and str(c["metadata"].get("chunk_id")) not in covered]


def covered_ids(paths: list[str]) -> set[str]:
    out: set[str] = set()
    for p in paths:
        try:
            with open(p, encoding="utf-8") as fh:
                for it in json.load(fh).get("items", []):
                    out |= set(it.get("relevant") or [])
        except FileNotFoundError:
            continue
    return out


def _leak_report(path: str) -> None:
    from ingestion.tag_layers import load_cards
    byid = {str(c["metadata"].get("chunk_id")): c for c in load_cards(0)}
    items = json.load(open(path, encoding="utf-8"))["items"]
    scored = []
    for it in items:
        cid = (it.get("relevant") or [None])[0]
        if cid in byid:
            scored.append((leak_score(it["query"], byid[cid]["document"]), it, cid))
    scored.sort(reverse=True, key=lambda x: x[0])
    vals = [s for s, _, _ in scored]
    print(f"어휘 누수 점수 — 문항 {len(vals)}개")
    print(f"  평균 {sum(vals)/len(vals):.3f} · 최대 {max(vals):.3f} · 0.5 이상 {sum(1 for v in vals if v >= 0.5)}개")
    print("\n상위 12개(사람이 직접 볼 것):")
    for s, it, cid in scored[:12]:
        print(f"  {s:.2f}  {it['query'][:44]:44s} ← {byid[cid]['technique'][:26]}")


def main() -> None:
    ap = argparse.ArgumentParser(description="커버리지 평가셋 생성")
    ap.add_argument("--limit", type=int, default=0, help="앞 N장만(0=전체)")
    ap.add_argument("--dry-run", action="store_true", help="파일로 저장하지 않는다")
    ap.add_argument("--out", default=None, help="저장 경로")
    ap.add_argument("--model", default=_MODEL)
    ap.add_argument("--leak-report", default=None, help="기존 셋의 누수 점검만")
    ap.add_argument("--against", nargs="*",
                    default=["eval/qa_set_realistic.json", "eval/qa_set.json"],
                    help="이미 커버된 것으로 볼 평가셋")
    args = ap.parse_args()

    if args.leak_report:
        _leak_report(args.leak_report)
        return

    from ingestion.tag_layers import load_cards
    cards = load_cards(0)
    todo = uncovered_cards(cards, covered_ids(args.against))
    if args.limit:
        todo = todo[: args.limit]

    print(f"[gen_qa_set] 미커버 검색대상 {len(todo)}장 · 모델 {args.model}", flush=True)

    def progress(done, total, item):
        mark = "!" if item["error"] else (" " if item["query"] else "?")
        leak = f"누수 {item['leak']:.2f}" if item["leak"] is not None else "-"
        print(f" {done:3d}/{total} {mark} {item['technique'][:26]:26s} {leak}  {item['query'][:40]}",
              flush=True)

    got = generate(todo, make_groq_generator(args.model), progress=progress)

    ok = [g for g in got if g["query"]]
    leaks = [g["leak"] for g in ok]
    print(f"\n생성 {len(ok)}/{len(got)}")
    if leaks:
        print(f"어휘 누수 평균 {sum(leaks)/len(leaks):.3f} · 0.5 이상 {sum(1 for v in leaks if v >= 0.5)}개")

    if args.dry_run or not args.out:
        print("--dry-run / --out 없음: 저장하지 않았습니다.")
        return

    payload = {
        "_comment": (
            "커버리지 평가셋 — qa_set_realistic 이 한 번도 겨냥하지 않는 카드용. "
            "query=사용자가 칠 법한 작업 요청(기법명 미언급), relevant=그 카드 chunk_id. "
            "⚠️ LLM 생성 라벨이고 single-gold 다. 사람 라벨(qa_set_realistic)과 수치를 "
            "직접 비교하지 말 것. 'leak' 은 질의↔카드 어휘 중첩(높을수록 표면 매칭 위험)."
        ),
        "collection": "prompt_techniques",
        "generatedBy": {"model": args.model, "temperature": _TEMPERATURE,
                        "script": "eval/gen_qa_set.py"},
        "items": [{"query": g["query"], "relevant": g["relevant"],
                   "technique": g["technique"], "leak": g["leak"], "why": g["why"]}
                  for g in ok],
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"저장: {args.out} ({len(ok)}문항)")


if __name__ == "__main__":
    main()
