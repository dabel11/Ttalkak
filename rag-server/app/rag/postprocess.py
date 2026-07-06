"""
postprocess.py
────────────────────────────────────────────────────────────
생성 결과의 파싱·복원 순수 함수 모음 (모델·DB 의존 없음 → 단독 테스트 가능).

- parse_generation : LLM의 구조화 JSON 출력을 관대하게 파싱
- build_answer     : JSON → 기존 화면 표시용 마크다운 복원
- extract_*        : 레거시 마크다운 정규식 추출 (JSON 파싱 실패 시 폴백)

main.py 의 run_generation() 이 이들을 조합한다. eval 스크립트와의 하위호환을 위해
main.py 가 동일 이름으로 재노출(re-export)한다.
"""

import json
import re


# ── 구조화 JSON 경로 ─────────────────────────────────────────
def parse_generation(raw: str) -> dict | None:
    """LLM 출력에서 구조화 JSON을 관대하게 파싱.
    mode 필드가 있는 유효 객체면 dict, 아니면 None(→ 레거시 정규식 폴백)."""
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.DOTALL)   # 코드펜스·앞뒤 잡담 허용
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except Exception:
        return None
    if not isinstance(obj, dict) or obj.get("mode") not in ("improve", "ask"):
        return None
    return obj


def build_answer(p: dict) -> str:
    """구조화 JSON → 기존 화면 표시용 마크다운 복원.
    익스텐션 UI·history 왕복(assistant 턴 저장) 형식을 기존과 동일하게 유지한다."""
    if p["mode"] == "ask":
        lines = ["**확인이 필요해요 🤔**"]
        if p.get("summary"):
            lines.append(str(p["summary"]))
        lines += [f"• {q}" for q in p.get("questions") or []]
        return "\n".join(lines)

    parts = ["---", "**개선된 프롬프트:**", "", str(p.get("improved_prompt") or ""), "",
             "---", "**적용한 기법:**"]
    for t in p.get("techniques") or []:
        name   = t.get("name", "") if isinstance(t, dict) else str(t)
        reason = t.get("reason", "") if isinstance(t, dict) else ""
        parts.append(f"• {name}: {reason}" if reason else f"• {name}")
    changes = p.get("changes") or []
    if changes:
        parts += ["", "**개선 포인트:**"] + [f"- {c}" for c in changes]
    parts.append("---")
    return "\n".join(parts)


# ── 레거시 정규식 경로 (폴백) ────────────────────────────────
def extract_improved_prompt(answer: str) -> str:
    """
    LLM 응답에서 '개선된 프롬프트' 섹션만 추출.
    포맷: **개선된 프롬프트:** ... --- **적용한 기법:**

    종료점은 구조 마커('적용한 기법'/'개선 포인트')를 우선 사용한다. 개선 프롬프트가
    사용자 원문(회의록·코드·마크다운 등)을 통째로 담으면서 그 안에 '---' 구분선이
    들어와도, 그 지점에서 잘리지 않게 하기 위함이다. (중간 '---'는 보존, 꼬리만 제거)

    응답이 '질문 모드'(개선 프롬프트 블록 없음)면 빈 문자열을 반환한다.
    → 프론트는 improved_prompt 가 비면 Execute 버튼을 숨긴다.
    """
    # 개선 프롬프트 블록(마커)이 없으면 질문 모드 → Execute 대상 없음
    if '개선된 프롬프트' not in answer:
        return ""

    # 1) '개선된 프롬프트' 헤더 위치 (볼드·콜론 유무 허용)
    header = re.search(r'\*\*\s*개선된 프롬프트\s*:?\s*\*\*|개선된 프롬프트\s*:',
                       answer, re.IGNORECASE)
    if not header:
        return ""
    body = answer[header.end():]

    # 2) 종료점 = 구조 마커(사용자 원문엔 등장하지 않음). 가장 먼저 나오는 것에서 끊는다.
    #    바 '---' 는 종료점으로 쓰지 않는다(원문에 포함될 수 있으므로).
    end = re.search(
        r'\n\s*\*\*\s*적용한\s*기법|\n\s*\*\*\s*개선\s*포인트'
        r'|\n\s*적용한\s*기법\s*[:：]|\n\s*개선\s*포인트\s*[:：]',
        body, re.IGNORECASE,
    )
    section = body[:end.start()] if end else body

    # 3) 앞쪽 구분선/공백, 꼬리 구분선('---')만 제거 (중간 '---'는 원문이므로 보존)
    section = re.sub(r'^\s*-{3,}\s*\n', '', section.lstrip('\n'))
    section = re.sub(r'\n\s*-{3,}\s*$', '', section.rstrip())
    return section.strip()


def extract_applied_techniques(answer: str) -> list[str]:
    """**적용한 기법:** 섹션에서 기법명만 추출 (bullet 첫 콜론 앞 토큰)."""
    m = re.search(
        r'\*\*적용한\s*기법[:\s]*\*\*\s*\n+(.*?)(?=\n\s*\*\*|\n\s*---|\Z)',
        answer, re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    techs = []
    for line in m.group(1).split('\n'):
        line = line.strip()
        if line and line[0] in ('•', '-', '*'):
            name = re.sub(r'^[•\-\*]\s*', '', line).split(':')[0].strip()
            if name:
                techs.append(name)
    return techs


def extract_changes(answer: str) -> list[str]:
    """**개선 포인트:** 섹션 텍스트를 줄 단위 리스트로 반환."""
    m = re.search(
        r'\*\*개선\s*포인트[:\s]*\*\*\s*\n+(.*?)(?=\n\s*\*\*|\n\s*---|\Z)',
        answer, re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    lines = [ln.strip() for ln in m.group(1).strip().splitlines() if ln.strip()]
    return lines
