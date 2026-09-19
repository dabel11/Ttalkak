"""
eval/layer_eval.py
────────────────────────────────────────────────────────────
카드 층(layer) 분류를 회귀 셋(`eval/layer_set.json`)으로 채점한다.

왜 필요한가: 층 어휘·분류 프롬프트를 고칠 때마다 "나아졌나 흔들렸나"를
눈으로 34장 훑어서는 판정할 수 없다. v1 은 실제로 두 번 연속 다른 방향으로
무너졌다(system 을 한 번도 안 고름 → meta 가 과흡인).

⚠️ 회귀 셋 라벨은 **작성자 1인 판단**이다. 여기 수치는 '정답률'이 아니라
   '그 판단과의 일치도'다. 팀 검토 전까지 잠정.

사용법 (rag-server/ 에서):
    python3 -m eval.layer_eval              # 현재 DB 분류를 채점
    python3 -m eval.layer_eval --show-miss  # 틀린 것만 자세히
"""

import argparse
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.rag.layers import LAYER_NAMES, SEARCHABLE_LAYERS, get_card_layer  # noqa: E402

_SET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "layer_set.json")


def load_set(path: str = _SET_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["cases"]


def score(cases: list[dict], actual: dict[str, str]) -> dict:
    """회귀 셋 대비 일치도. actual: {technique: layer}."""
    hit = miss = absent = 0
    # 검색 포함/제외라는 **최종 효과** 기준 일치도 — 층이 달라도 효과가 같으면 무해하다
    effect_hit = 0
    misses: list[dict] = []

    for case in cases:
        got = actual.get(case["technique"])
        if got is None:
            absent += 1
            continue
        want = case["expected"]
        if got == want:
            hit += 1
        else:
            miss += 1
            misses.append({**case, "got": got})
        if (got in SEARCHABLE_LAYERS) == (want in SEARCHABLE_LAYERS):
            effect_hit += 1

    total = hit + miss
    return {
        "total": total,
        "absent": absent,
        "exact": hit,
        "exactRate": (hit / total) if total else 0.0,
        "effectRate": (effect_hit / total) if total else 0.0,
        "misses": misses,
        "confusion": Counter((m["expected"], m["got"]) for m in misses),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="카드 층 분류 회귀 채점")
    parser.add_argument("--show-miss", action="store_true", help="틀린 항목 자세히")
    parser.add_argument("--from", dest="src", default=None,
                        help="배치 출력 JSON(tag_layers --out)을 채점. "
                             "생략하면 현재 DB를 채점한다")
    args = parser.parse_args()

    if args.src:
        # ⭐ 분류기 **원본** 품질. DB 는 사람 override 가 섞여 있어 채점하면 순환 참조가 된다
        #    (override 가 회귀 셋에서 왔으므로 점수가 구조적으로 올라간다).
        with open(args.src, encoding="utf-8") as fh:
            rows = json.load(fh)
        actual = {r["technique"]: (r.get("llmLayer") or r["layer"]) for r in rows}
        print(f"채점 대상: LLM 원본 출력 ({args.src})")
    else:
        from ingestion.tag_layers import load_cards
        actual = {c["technique"]: get_card_layer(c) for c in load_cards(0)}
        human = sum(1 for c in load_cards(0)
                    if (c.get("metadata") or {}).get("layerSource") == "human")
        print(f"채점 대상: 현재 DB (사람 override {human}장 포함 — 분류기 품질이 아니다)")

    cases = load_set()
    got = score(cases, actual)

    print(f"회귀 셋 {got['total']}장 (DB 에 없음 {got['absent']})")
    print(f"  층 정확 일치 : {got['exact']}/{got['total']} = {got['exactRate']:.0%}")
    print(f"  검색 포함/제외 일치 : {got['effectRate']:.0%}  ← 실제 검색에 미치는 효과 기준")

    if got["confusion"]:
        print("\n  혼동 (기대 → 실제):")
        for (want, gotv), n in got["confusion"].most_common():
            print(f"    {n:2d}  {want} → {gotv}")

    if args.show_miss and got["misses"]:
        print("\n  불일치 상세:")
        for m in got["misses"]:
            print(f"    {m['technique'][:36]:36s} 기대={m['expected']:16s} 실제={m['got']}")
            print(f"       근거: {m['note']}")


if __name__ == "__main__":
    main()
