"""
eval/placeholders.py
────────────────────────────────────────────────────────────
결과물 속 자리표시자(`[회사명]`, `OO`, `OOO-OOOO`)를 코드로 찾는다.

왜 코드인가: judge 에 "정상 자리표시자는 결함이 아니다"라고 정의로 알려 줘도, 조정에 쓰지 않은
결과물 21회 중 6회에서 정상 자리표시자를 결함·지어내기로 잘못 봤다(WORKLOG 2026-09-17).
그래서 ① 자리표시자 결함은 코드로 판정하고 ② judge 에는 자리표시자를 가린 결과물을 보낸다.

판정 규칙 — 모양만으로는 제목·태그(`[일정]`, `[결정]`, `[Card 1]`)와 자리표시자(`[일자]`,
`[주소]`)가 구별되지 않는다. 그래서 괄호 안 **마지막 낱말이 '채울 칸' 명사인가**로 가른다:
  1. `OO`·`○○`·`XX`·`X` 표시가 있으면 자리표시자     — [OO Fintech], [X], OOO-OOOO
  2. '입력'·'붙여넣기'로 끝나면 자리표시자              — [고객 이름 입력]
  3. 예시용 이메일·주소면 자리표시자                    — [recruit@company.com]
  4. 짧고(15자 이하) 콜론이 없고 채울 칸 명사로 끝나면 자리표시자 — [고객 이름], [주문 일자]
코드 블록·인라인 코드 속 대괄호(rows[0])는 보지 않는다.
"""

import re

PLACEHOLDER_MASK = "⟦자리표시자⟧"

# '채울 칸' 명사 — 괄호 안 마지막 낱말이 이것으로 끝나면 자리표시자다.
# 제목·태그에 흔한 명사(일정·결정·사항·업무·요건·방법·안내)는 일부러 넣지 않는다.
_SLOT_NOUNS = (
    "이름", "성함", "명", "날짜", "일자", "일시", "일", "연락처", "전화번호", "번호", "주소",
    "이메일", "메일", "URL", "링크", "금액", "가격", "장소", "로고", "서명", "직함",
    "부서", "담당자", "플랫폼", "기간", "수신자", "발신자", "시기",
    # 2026-09-20 Qwen 결과물 — 칸을 '무엇을 쓸지'로 적는 양식([활동 내용], [메뉴 종류], [위치])
    "내용", "종류", "위치", "시간", "설명", "분야", "혜택", "대책", "메뉴", "계정", "힌트", "호수", "오후",
)
_MASK_MARK = re.compile(r"(?<![A-Za-z])(?:O{2,}|○{2,}|X{2,}|x{2,}|X)(?![A-Za-z])")
_EXAMPLE_ADDR = re.compile(r"@(?:company|example|domain|email)\.|^https?://(?:www\.)?example\.", re.I)
_CODE = re.compile(r"```.*?```|`[^`\n]*`", re.S)
_BRACKET = re.compile(r"\[([^\[\]\n]{1,80})\](?!\()")        # 마크다운 링크 [글](url) 제외
_BARE = re.compile(r"(?<![A-Za-z\[])(?:O{2,}|○{2,})(?:-(?:O{2,}|○{2,}))*(?![A-Za-z\]])")
# 날짜·시각 자리표시자 — '20XX년 X월 X일', 'XX시' (2026-09-19 새 결과물에서 발견)
_DATE_SLOT = re.compile(r"(?<![A-Za-z\d])(?:\d{0,2}[Xx]{2}|[Xx]{1,2})\s?(?=년|월|일|시|분)[년월일시분]")


_EXAMPLE_SLOT = re.compile(r"(?:^|[\s,(])예\s*[:：)]")      # [핵심 재료, 예: 프랑스산 버터]
_CARD_NO = re.compile(r"^\s*\d+\s*/\s*\d+\s*$")               # [1/5] 카드 번호


def _is_slot(content: str) -> bool:
    c = content.strip()
    if _CARD_NO.match(c):
        return False
    if _MASK_MARK.search(c) or _EXAMPLE_SLOT.search(c):
        return True
    if c.endswith(("입력", "붙여넣기")):
        return True
    if _EXAMPLE_ADDR.search(c):
        return True
    if len(c) > 15 or ":" in c:
        return False
    last = re.split(r"[\s/·]+", c)[-1]
    return last.endswith(_SLOT_NOUNS)


def _code_spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for m in _CODE.finditer(text)]


def find_placeholders(text: str) -> list[tuple[int, int, str]]:
    """자리표시자 위치 목록 [(시작, 끝, 원문)] — 겹치지 않고 위치 순."""
    code = _code_spans(text)
    in_code = lambda i: any(a <= i < b for a, b in code)
    found = []
    for m in _BRACKET.finditer(text):
        if not in_code(m.start()) and _is_slot(m.group(1)):
            found.append((m.start(), m.end(), m.group(0)))
    taken = [(a, b) for a, b, _ in found]
    for pat in (_BARE, _DATE_SLOT):
        for m in pat.finditer(text):
            if in_code(m.start()) or any(a <= m.start() < b for a, b in taken):
                continue
            found.append((m.start(), m.end(), m.group(0)))
            taken.append(m.span())
    return sorted(found)


def mask(text: str) -> str:
    """자리표시자를 PLACEHOLDER_MASK 로 바꾼다 — judge 가 자리표시자를 지어내기로 읽지 못하게."""
    out, last = [], 0
    for a, b, _ in find_placeholders(text):
        out.append(text[last:a])
        out.append(PLACEHOLDER_MASK)
        last = b
    out.append(text[last:])
    return "".join(out)
