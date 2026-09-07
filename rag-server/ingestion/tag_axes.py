"""
ingestion/tag_axes.py
────────────────────────────────────────────────────────────
기법 카드에 축(axes) 태그를 붙이는 일회성 배치.

왜 LLM 인가 — 임베딩으로는 못 한다(실측 2026-08-15):
  축 설명과 카드를 코사인으로 붙여보면 고신뢰 배정 68장 중 38장(56%)이
  **축 이름과 단어가 겹칠 때**였고, 카드의 44%는 1·2위 축이 사실상 동점이었다.
  이름에 'Uncertainty'가 들어간 카드조차 uncertainty 축으로 가지 않았다.
  질의↔카드에서 본 유사도 실패가 카드↔축에서 그대로 반복된다.

판정 기준은 카드의 **Prompt Template** 이다 — 그 기법이 개선 프롬프트에
실제로 추가하는 지시문. Definition 은 추상적이고 Use When 은 상황이지만
Prompt Template 은 결과물이라 판정이 흔들리지 않는다.

사용법 (rag-server/ 에서):
    python3 -m ingestion.tag_axes --limit 20 --dry-run   # 미리보기(DB 미변경)
    python3 -m ingestion.tag_axes --limit 20             # 20장만 태깅
    python3 -m ingestion.tag_axes                        # 전량
    python3 -m ingestion.tag_axes --report               # 태깅 현황만 출력

⚠️ 태깅 결과는 사람이 검토해야 한다. 태깅이 곧 조회의 정답 라벨이 되므로,
   틀린 태그는 그대로 검색 오류가 된다.
"""

import argparse
import json
import os
import time

from sqlalchemy import text

from app.core.db import get_engine
from app.rag.axes import (
    AXES_VERSION,
    MAX_AXES_PER_CARD,
    build_axis_catalog,
    normalize_axes,
    summarize_axis_coverage,
)


_MODEL = "llama-3.3-70b-versatile"   # 축 선택은 '판단'이라 8b는 위험. 파일럿으로 확인할 것.
_TEMPERATURE = 0.0                    # 태깅은 결정적이어야 한다


def build_tagging_prompt(card_text: str) -> str:
    """카드 하나를 축으로 분류할 프롬프트."""
    return f"""너는 프롬프트 기법 카드를 분류한다. 아래 카드가 개선 프롬프트에
**어떤 종류의 지시문을 추가하는지**를 보고 축을 고른다.

판정 기준 — 카드의 Prompt Template 을 우선해서 본다.
그 기법이 실제로 만들어내는 지시문이 무엇인지가 축을 결정한다.
Definition 은 추상적이고 Use When 은 상황일 뿐이다.

[축 목록 — 이 중에서만 고른다]
{build_axis_catalog("card")}

[규칙]
1. 최대 {MAX_AXES_PER_CARD}개. 가장 잘 맞는 것부터 순서대로.
2. 목록에 없는 이름을 지어내지 마라.
3. 애매하면 적게 골라라. 억지로 채우지 마라.
4. 어느 축에도 해당하지 않으면 빈 배열을 반환하라.

[출력 — JSON 하나만]
{{"axes": ["축이름", ...], "reason": "Prompt Template 의 어느 부분을 보고 골랐는지 한 줄"}}

[카드]
{card_text}"""


def make_groq_tagger(model: str = _MODEL):
    """운영용 태거. 테스트에서는 이걸 쓰지 않고 fake 를 주입한다."""
    from groq import Groq

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SystemExit("GROQ_API_KEY 가 필요합니다.")
    client = Groq(api_key=api_key)

    def tag_call(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model,
            temperature=_TEMPERATURE,
            max_tokens=200,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or "{}"

    return tag_call


def parse_tagging_result(raw: str) -> tuple[list[str], str]:
    """태거 응답 → (축 목록, 근거). 실패 시 ([], "")."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return [], ""

    if not isinstance(data, dict):
        return [], ""

    return (
        normalize_axes(data.get("axes"), limit=MAX_AXES_PER_CARD),
        str(data.get("reason") or "").strip(),
    )


def is_rate_limited(error: Exception) -> bool:
    """429·5xx 인지 판정. 170장 배치가 한도에 걸려 통째로 죽는 것을 막는다."""
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status is None:
        status = getattr(getattr(error, "response", None), "status_code", None)
    try:
        if int(status) in {429, 500, 502, 503, 504}:
            return True
    except (TypeError, ValueError):
        pass
    return "rate limit" in str(error).lower()


def tag_cards(
    cards: list[dict],
    tag_call,
    max_attempts: int = 4,
    base_delay_seconds: float = 20.0,
    sleep_fn=time.sleep,
) -> list[dict]:
    """카드 목록에 축을 매긴다. 실패한 카드는 axes=[] 로 남긴다(조용히 버리지 않는다).

    쿼터(429)에는 지수 백오프로 재시도한다 — 파일럿에서 22장 중 6장이
    한도에 걸려 무배정으로 남았다(2026-08-15).
    """
    tagged = []

    for card in cards:
        axes, reason, error = [], "", None

        for attempt in range(1, max_attempts + 1):
            try:
                axes, reason = parse_tagging_result(
                    tag_call(build_tagging_prompt(card["document"]))
                )
                error = None
                break
            except Exception as exc:          # noqa: BLE001 — 한 장 실패로 배치를 멈추지 않는다
                error = str(exc)[:120]
                if attempt >= max_attempts or not is_rate_limited(exc):
                    break
                sleep_fn(base_delay_seconds * (2 ** (attempt - 1)))

        tagged.append({
            "id": card["id"],
            "technique": card["technique"],
            "axes": axes,
            "reason": reason,
            "error": error,
        })

    return tagged


def load_cards(limit: int = 0) -> list[dict]:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                "SELECT id, document, `metadata` FROM rag_chunk "
                "WHERE collection_name = :collection ORDER BY id"
            ),
            {"collection": "prompt_techniques"},
        ).fetchall()

    cards = []
    for row_id, document, raw_metadata in rows:
        metadata = json.loads(raw_metadata) if isinstance(raw_metadata, str) else (raw_metadata or {})
        cards.append({
            "id": row_id,
            "document": document,
            "metadata": metadata,
            "technique": str(metadata.get("technique") or metadata.get("source") or ""),
        })

    return cards[:limit] if limit else cards


def save_axes(tagged: list[dict]) -> int:
    """메타데이터에 axes 와 axesVersion 을 기록한다."""
    written = 0
    with get_engine().begin() as connection:
        for item in tagged:
            if not item["axes"]:
                continue
            row = connection.execute(
                text("SELECT `metadata` FROM rag_chunk WHERE id = :id"), {"id": item["id"]}
            ).fetchone()
            metadata = json.loads(row[0]) if isinstance(row[0], str) else (row[0] or {})
            metadata["axes"] = item["axes"]
            metadata["axesVersion"] = AXES_VERSION
            connection.execute(
                text("UPDATE rag_chunk SET `metadata` = :m WHERE id = :id"),
                {"m": json.dumps(metadata, ensure_ascii=False), "id": item["id"]},
            )
            written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="기법 카드 축 태깅")
    parser.add_argument("--limit", type=int, default=0, help="앞 N장만(0=전체)")
    parser.add_argument("--only", default=None,
                        help="쉼표 구분 기법명만 태깅(파일럿용). 정답을 아는 구간부터 검증할 때")
    parser.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 결과만 출력")
    parser.add_argument("--report", action="store_true", help="현재 태깅 현황만 출력")
    parser.add_argument("--model", default=_MODEL)
    args = parser.parse_args()

    cards = load_cards(0)
    if args.only:
        wanted = {n.strip() for n in args.only.split(',') if n.strip()}
        cards = [c for c in cards if c['technique'] in wanted]
    if args.limit:
        cards = cards[: args.limit]

    if args.report:
        print(json.dumps(summarize_axis_coverage(cards), ensure_ascii=False, indent=2))
        return

    print(f"[tag_axes] 카드 {len(cards)}장 · 모델 {args.model} · 축 어휘 {AXES_VERSION}")
    tagged = tag_cards(cards, make_groq_tagger(args.model))

    for item in tagged:
        mark = "!" if item["error"] else (" " if item["axes"] else "?")
        print(f" {mark} {item['technique'][:38]:38s} {item['axes']}")
        if item["reason"]:
            print(f"     └ {item['reason'][:90]}")

    failed = [t for t in tagged if t["error"] or not t["axes"]]
    print(f"\n태깅 성공 {len(tagged) - len(failed)}/{len(tagged)}   실패·무배정 {len(failed)}")

    if args.dry_run:
        print("--dry-run: DB 에 쓰지 않았습니다.")
        return

    print(f"DB 반영 {save_axes(tagged)}장")


if __name__ == "__main__":
    main()
