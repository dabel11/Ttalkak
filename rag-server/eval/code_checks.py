"""
eval/code_checks.py
────────────────────────────────────────────────────────────
uplift_set_v2.json 의 코드 판정(`checks`)과 코드로 가리는 결함을 실행한다. LLM 호출 없음.

  run_check(check, output)          → 한 판정의 통과 여부
  run_item(item, output)            → 문항 하나의 코드 판정 전부 + 결함 2종
      placeholder_defect: 요청에 준 값(preserve)이 결과물에 없는데 그 자리에 자리표시자가 있다
      invented_values   : entity_facts 문항에서 요청에 없던 숫자 값(value_check)

자리표시자 결함을 judge 에서 뺀 이유는 eval/placeholders.py 머리말 참고.
"""

import re

from eval.placeholders import find_placeholders
from eval.value_check import invented_values, normalize_spaces

# max_chars 는 결과물 '본문'만 센다 — 앞뒤 메타 문장은 사용자가 요청한 분량이 아니다
_META_LINE = re.compile(r"(?:다음은|아래는).{0,40}(?:입니다|이다)[.:]?\s*$|(?:드리겠습니다|드립니다|했습니다)[.:]?\s*$|:\s*$")
_TABLE = re.compile(r"^\s*\|.*\|\s*$\n^\s*\|[\s:|-]+\|\s*$", re.M)


def body_text(output: str) -> str:
    """앞뒤 메타 줄(머리말·맺음말)과 구분선을 뗀 본문."""
    lines = [l for l in output.strip().splitlines()]
    while lines and (not lines[0].strip() or _META_LINE.search(lines[0]) or set(lines[0].strip()) <= set("-*_=")):
        lines.pop(0)
    while lines and (not lines[-1].strip() or _META_LINE.search(lines[-1]) or set(lines[-1].strip()) <= set("-*_=")):
        lines.pop()
    return "\n".join(lines).strip()


def _lang_is(output: str, lang: str) -> bool:
    ko = len(re.findall(r"[가-힣]", output))
    en = len(re.findall(r"[A-Za-z]", output))
    return ko > en if lang == "ko" else en > ko


def run_check(check: dict, output: str) -> bool:
    # gpt-oss 는 숫자와 단위 사이에 좁은 공백(U+202F)을 쓴다 — '7월\u202f15일' 이 '7월 15일' 과 달라
    # 새 결과물 30건에서 맞는 결과물 3건을 불합격 처리했다(2026-09-19)
    output = normalize_spaces(output)
    low = output.lower()
    t = check["type"]
    if t == "contains_any":
        return any(v.lower() in low for v in check["any"])
    if t == "contains_all":
        return all(v.lower() in low for v in check["all"])
    if t == "max_chars":
        return len(body_text(output)) <= check["n"]
    if t == "has_table":
        return bool(_TABLE.search(output))
    if t == "has_code_block":
        return "```" in output
    if t == "lang":
        return _lang_is(output, check["value"])
    raise ValueError(f"알 수 없는 판정 종류: {t}")


def run_item(item: dict, output: str) -> dict:
    output = normalize_spaces(output)
    checks = [{"check": c, "passed": run_check(c, output)} for c in item["checks"]]
    placeholders = [s for _, _, s in find_placeholders(output)]
    preserve_failed = [r["check"] for r in checks
                       if r["check"]["basis"] == "preserve" and not r["passed"]]
    return {
        "checks": checks,
        "placeholders": placeholders,
        "placeholder_defect": bool(preserve_failed and placeholders),
        "invented_values": (invented_values(item["query"], output)
                            if item.get("entity_facts") else None),
    }
