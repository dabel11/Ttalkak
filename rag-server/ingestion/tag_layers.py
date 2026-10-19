"""
ingestion/tag_layers.py
────────────────────────────────────────────────────────────
기법 카드에 층(layer) 을 분류하는 일회성 배치. `tag_axes.py` 와 같은 구조다.

왜 필요한가 — WORKLOG 2026-09-12:
  코퍼스 170장 중 **최소 26%(44장)** 가 '사용자 프롬프트에 덧붙일 지시문'이 아니다
  (딸깍 자신의 동작 15 · 시스템 설계자용 20 · 빈 카드 12). 실사용 질의 top-5 의
  **30%** 가 이런 카드였고 — 코퍼스 비율보다 높다 — 축 쏠림(`output_format` 54,
  `constraints` 51)의 3분의 1도 이 카드들이다.

왜 LLM 인가:
  이름·템플릿 규칙으로는 경계가 안 잡힌다. `Source-Bounded Answering`(사용자가 쓸 수 있음)
  과 `Prompt Injection Defense`(검색 시스템 필요)는 둘 다 '자료에 묶는' 기법이라
  표면이 같다. 가르는 것은 **"일반 사용자 요청 뒤에 덧붙일 수 있는가"** 라는 판단이다.

사용법 (rag-server/ 에서):
    python3 -m ingestion.tag_layers --limit 10 --dry-run   # 미리보기(DB 미변경)
    python3 -m ingestion.tag_layers                        # 전량 분류
    python3 -m ingestion.tag_layers --report               # 현황만 출력
    python3 -m ingestion.tag_layers --out review.json      # 검토용 파일로 저장

⚠️ 결과는 사람이 검토해야 한다. 층이 곧 검색 대상 여부를 정하므로,
   잘못 분류하면 멀쩡한 카드가 검색에서 사라진다.
   (단 **미분류는 검색에 포함**된다 — layers.is_searchable 참조. 배치가 실패해도
    코퍼스가 비지 않는다.)
"""

import argparse
import json
import os
import time

from sqlalchemy import text

# ⏱️ LLM 호출 타임아웃 — app/core/timeouts.py 가 단일 출처.
# 2026-09-13 에 운영 경로(app/rag/*)만 고쳤더니 측정 도구 11곳이 그대로 남아 있었고,
# 그 탓에 gen_eval 이 judge 응답을 기다리며 **5시간 42분을 멈춰** 있었다(캐시 13/18 에서
# 2시간 9분간 무진전, ESTABLISHED 소켓 4개 점유). 예외가 안 나므로 _retry 도 못 잡는다.
from app.core.timeouts import GEN_SECONDS
from app.core.db import get_engine
from app.rag.layers import (
    LAYERS_VERSION,
    build_layer_catalog,
    normalize_layer,
    summarize_layer_coverage,
)


_MODEL = "openai/gpt-oss-120b"   # 층 판정은 '판단'이다. 소형은 경계 사례에서 위험.
_TEMPERATURE = 0.0               # 분류는 결정적이어야 한다
# gpt-oss 계열은 최종 JSON 앞에 추론 토큰을 먼저 쓴다 → 예산이 빠듯하면
# `400 json_validate_failed`. tag_axes 에서 200이 4토큰 차로 전량 실패한 전례가 있다.
_MAX_TOKENS = 1500


def build_layer_prompt(card_text: str) -> str:
    """카드 하나를 층으로 분류할 프롬프트."""
    return f"""너는 프롬프트 기법 카드가 **프롬프트 개선에 쓸모가 있는지**로 분류한다.

상황: 우리는 사용자의 거친 요청(예: '제주도 여행 블로그 글 써줘')을 더 나은 프롬프트로
고쳐 주는 서비스다. 이 카드는 그 개선을 만들 때 **참고 자료**로 들어간다.

가르는 질문 하나다:
  "이 카드를 참고해 개선 프롬프트를 만들면, 사용자가 원한 결과물이 더 좋아지는가?"

⚠️ '이 문장을 요청 뒤에 붙일 수 있는가'를 묻는 게 **아니다**. 명령문이면 무엇이든 붙는다.
   붙여서 **실제로 효과가 있는가**를 물어라.

[층 — 이 중에서만 고른다]
{build_layer_catalog()}

[판정 순서 — 좁은 것부터]
1. Prompt Template·Definition 에 실질 내용이 없으면 → degenerate
   (내용이 없으면 다른 층을 고려하지 마라. 좋게 봐주지 마라.)
2. 그 문장만 프롬프트에 써넣었을 때 **아무 일도 안 일어나면** → system
   (도구 연결·검색 인프라·에이전트 루프·모델 설정이 있어야 성립하는 것)
3. '좋은 프롬프트를 만들어라' 자체를 말할 뿐 **무엇을 넣을지는 안 알려주면** → meta
4. 개선 프롬프트에 **구체적으로 무엇을 넣을지** 알려주면 → user_instruction

[⚠️ meta 를 넓게 잡지 마라 — 실측된 오분류다]
'프롬프트를 다루는 카드'가 전부 meta 가 아니다. 가르는 것은 **방법을 알려주는가**다.
- "요청을 최적의 프롬프트로 변환하라" (방법 없음, 우리가 이미 하는 일)  → meta
- "지시를 앞에 두어라" / "모호한 목표를 구체 기준으로 바꿔라"
  / "작업을 하위 단계로 나눠라" (무엇을 할지 말해 줌)                 → user_instruction

[주의]
- 카드가 '좋은 기법인가'를 묻는 게 아니다. **우리 개선에 쓸모가 있는가**만 본다.
- 애매하면 user_instruction 으로 두어라(검색에서 빼는 쪽이 더 위험하다).

[출력 — JSON 하나만]
{{"layer": "층이름", "reason": "카드의 어느 부분을 보고 골랐는지 한 줄"}}

[카드]
{card_text}"""


def make_groq_tagger(model: str = _MODEL):
    """운영용 분류기. 테스트에서는 이걸 쓰지 않고 fake 를 주입한다."""
    from groq import Groq

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SystemExit("GROQ_API_KEY 가 필요합니다.")
    client = Groq(api_key=api_key, timeout=GEN_SECONDS)

    def tag_call(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=model,
            temperature=_TEMPERATURE,
            max_tokens=_MAX_TOKENS,
            reasoning_effort="low",   # gpt-oss 추론 토큰 절감(gen_eval judge 전례)
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or "{}"

    return tag_call


def parse_layer_result(raw: str) -> tuple[str, str]:
    """분류기 응답 → (층, 근거). 실패·어휘 밖이면 ("", "")."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    return normalize_layer(data.get("layer")), str(data.get("reason") or "").strip()


def is_rate_limited(error: Exception) -> bool:
    """429·5xx 인지 판정. 170장 배치가 한도에 걸려 통째로 죽는 것을 막는다.

    ⚠️ `400 json_validate_failed`(출력 예산 부족)는 여기서 False 다 — 재시도해도
    같은 결과라 옳지만, 그 카드는 미분류로 남아 **쿼터 소진과 겉모습이 같다.**
    전량 미분류면 429보다 `_MAX_TOKENS` 를 먼저 의심할 것.
    """
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
    progress=None,
) -> list[dict]:
    """카드 목록에 층을 매긴다. 실패한 카드는 layer="" 로 남긴다(조용히 버리지 않는다)."""
    tagged = []
    for index, card in enumerate(cards):
        layer, reason, error = "", "", None
        for attempt in range(max_attempts):
            try:
                layer, reason = parse_layer_result(
                    tag_call(build_layer_prompt(card["document"]))
                )
                error = None
                break
            except Exception as exc:                      # noqa: BLE001
                error = exc
                if not is_rate_limited(exc) or attempt == max_attempts - 1:
                    break
                sleep_fn(base_delay_seconds * (2 ** attempt))

        item = {
            "id": card["id"],
            "technique": card["technique"],
            "layer": layer,
            "reason": reason,
            "error": str(error) if error else None,
        }
        tagged.append(item)
        if progress:
            progress(index + 1, len(cards), item)
    return tagged


_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "layer_overrides.json")


def load_overrides(path: str = _OVERRIDES_PATH) -> dict[str, str]:
    """사람 판정 목록 {기법명: 층}. 파일이 없으면 빈 dict(무회귀)."""
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh).get("overrides") or {}
    except FileNotFoundError:
        print(f"[tag_layers] override 파일 없음 → LLM 분류만 사용: {path}")
        return {}
    out = {}
    for name, spec in raw.items():
        layer = normalize_layer(spec.get("layer") if isinstance(spec, dict) else spec)
        if layer:
            out[name] = layer
    return out


def apply_overrides(tagged: list[dict], overrides: dict[str, str]) -> list[dict]:
    """LLM 분류에 사람 판정을 덮어쓴다. `source` 로 출처를 남긴다.

    ⭐ 원본 LLM 판정은 `llmLayer` 에 보존한다 — 분류기 품질을 나중에 채점하려면
    override 이전 값이 있어야 한다(`eval/layer_eval.py --from`).
    """
    out = []
    for item in tagged:
        row = dict(item)
        row["llmLayer"] = item["layer"]
        forced = overrides.get(item["technique"])
        if forced and forced != item["layer"]:
            row["layer"] = forced
            row["source"] = "human"
        else:
            row["source"] = "human" if forced else "llm"
        out.append(row)
    return out


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


def save_layers(tagged: list[dict]) -> int:
    """메타데이터에 layer 와 layersVersion 을 기록한다(기존 키는 보존)."""
    written = 0
    with get_engine().begin() as connection:
        for item in tagged:
            if not item["layer"]:
                continue
            row = connection.execute(
                text("SELECT `metadata` FROM rag_chunk WHERE id = :id"), {"id": item["id"]}
            ).fetchone()
            metadata = json.loads(row[0]) if isinstance(row[0], str) else (row[0] or {})
            metadata["layer"] = item["layer"]
            metadata["layersVersion"] = LAYERS_VERSION
            # 이 층을 누가 정했는지. 사람 판정이 다음 배치에 조용히 덮이지 않도록 기록한다.
            metadata["layerSource"] = item.get("source", "llm")
            connection.execute(
                text("UPDATE rag_chunk SET `metadata` = :m WHERE id = :id"),
                {"m": json.dumps(metadata, ensure_ascii=False), "id": item["id"]},
            )
            written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="기법 카드 층 분류")
    parser.add_argument("--limit", type=int, default=0, help="앞 N장만(0=전체)")
    parser.add_argument("--only", default=None, help="쉼표 구분 기법명만(파일럿용)")
    parser.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 결과만 출력")
    parser.add_argument("--report", action="store_true", help="현재 분류 현황만 출력")
    parser.add_argument("--out", default=None, help="검토용 JSON 저장 경로")
    parser.add_argument("--model", default=_MODEL)
    parser.add_argument("--apply-overrides", action="store_true",
                        help="LLM 호출 없이 현재 DB 분류에 사람 판정만 덮어쓴다")
    parser.add_argument("--no-override", action="store_true",
                        help="사람 판정을 적용하지 않는다(분류기 원본 품질 측정용)")
    args = parser.parse_args()

    if args.apply_overrides:
        from app.rag.layers import get_card_layer
        overrides = load_overrides()
        cards = load_cards(0)
        current = [{"id": c["id"], "technique": c["technique"],
                    "layer": get_card_layer(c), "reason": "", "error": None}
                   for c in cards]
        applied = apply_overrides(current, overrides)
        changed = [a for a in applied if a["layer"] != a["llmLayer"]]
        for a in changed:
            print(f"  {a['technique'][:36]:36s} {a['llmLayer'] or '(없음)':16s} → {a['layer']}")
        missing = sorted(set(overrides) - {c["technique"] for c in cards})
        if missing:
            print(f"⚠️ override 에 있으나 코퍼스에 없는 기법: {missing}")
        print(f"\noverride {len(overrides)}건 중 {len(changed)}장 변경")
        print(f"DB 반영 {save_layers(applied)}장")
        return

    cards = load_cards(0)
    if args.only:
        wanted = {n.strip() for n in args.only.split(',') if n.strip()}
        cards = [c for c in cards if c['technique'] in wanted]
    if args.limit:
        cards = cards[: args.limit]

    if args.report:
        print(json.dumps(summarize_layer_coverage(cards), ensure_ascii=False, indent=2))
        return

    print(f"[tag_layers] 카드 {len(cards)}장 · 모델 {args.model} · 층 어휘 {LAYERS_VERSION}",
          flush=True)

    def progress(done, total, item):
        mark = "!" if item["error"] else ("?" if not item["layer"] else " ")
        print(f" {done:3d}/{total} {mark} {item['technique'][:34]:34s} {item['layer'] or '(미분류)'}",
              flush=True)

    tagged = tag_cards(cards, make_groq_tagger(args.model), progress=progress)

    counts: dict[str, int] = {}
    for item in tagged:
        counts[item["layer"] or "(미분류)"] = counts.get(item["layer"] or "(미분류)", 0) + 1
    print("\nLLM 분류:", json.dumps(counts, ensure_ascii=False), flush=True)

    # ⭐ 검토용 저장은 **override 이전**에 한다 — 분류기 원본 품질을 채점하려면
    #    사람 손이 닿지 않은 출력이 남아 있어야 한다(eval/layer_eval.py --from).
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(tagged, fh, ensure_ascii=False, indent=2)
        print(f"검토용 저장(LLM 원본): {args.out}", flush=True)

    if not args.no_override:
        overrides = load_overrides()
        tagged = apply_overrides(tagged, overrides)
        changed = sum(1 for t in tagged if t["layer"] != t["llmLayer"])
        print(f"사람 판정 override: {len(overrides)}건 중 {changed}장 변경", flush=True)

    if args.dry_run:
        print("--dry-run: DB 에 쓰지 않았습니다.")
        return

    print(f"DB 반영 {save_layers(tagged)}장", flush=True)


if __name__ == "__main__":
    main()
