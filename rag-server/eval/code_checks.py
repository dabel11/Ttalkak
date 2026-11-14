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
_META_LINE = re.compile(r"(?:다음은|아래는).{0,40}(?:입니다|이다)[.:]?\s*$|:\s*$")
# 맺음말은 '본문과 별개인 짧은 인사'일 때만 뗀다. 길이 제한이 없었을 때, 한 줄로 끝나는 문자·메일이
# '…부탁드립니다.' 로 끝나면 본문 전체가 맺음말로 떨어져 **0자**로 세어 분량 제한을 통과했다
# (2026-11-06 팀원 지적, 127자 문자가 90자 판정 통과). 그래서 ① 짧은 줄만 ② 본문이 남을 때만 뗀다.
_META_TAIL = re.compile(r"(?:드리겠습니다|드립니다|했습니다)[.:!]?\s*$")
_META_TAIL_MAX = 40
_TABLE = re.compile(r"^\s*\|.*\|\s*$\n^\s*\|[\s:|-]+\|\s*$", re.M)


def _meta_edge(line: str) -> bool:
    """맨 앞·맨 뒤에서 떼도 되는 줄인가 — 빈 줄·구분선·머리말·짧은 인사말."""
    s = line.strip()
    return (not s or set(s) <= set("-*_=") or bool(_META_LINE.search(s))
            or (len(s) <= _META_TAIL_MAX and bool(_META_TAIL.search(s))))


def body_text(output: str) -> str:
    """앞뒤 메타 줄(머리말·맺음말)과 구분선을 뗀 본문. 본문을 다 떼지는 않는다 — 한 줄이 남으면 멈춘다."""
    lines = output.strip().splitlines()
    while len(lines) > 1 and _meta_edge(lines[0]):
        lines.pop(0)
    while len(lines) > 1 and _meta_edge(lines[-1]):
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
