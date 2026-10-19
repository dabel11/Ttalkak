"""
eval/value_check.py
────────────────────────────────────────────────────────────
생성(generate) 결과물에서 **요청에 없던 숫자 값**을 코드로 찾는다 — 지어내기(fabrication) 후보.

왜 코드인가: judge 는 조정에 쓰지 않은 채용 공고 표본에서 지어낸 값을 근거까지 맞게 잡은 게
6회 중 3회뿐이었고 "Java 11 이상"은 3회 모두 놓쳤다(WORKLOG 2026-09-17). 결함 정의 E' 의
'독자가 사실로 믿고 따를 구체적인 값'(금액·비율·날짜·시간·기간·스펙)은 대부분 숫자라,
숫자는 코드가 빠짐없이 같은 결과로 찾을 수 있다.

**숫자와 단위를 함께 비교한다**(2026-09-19). 숫자만 비교하던 첫 판은 새 결과물 30건에서
놓친 7건이 전부 '요청 숫자와 우연히 같은 값'이었다 — 요청 "30시간"에 걸린 "30분·30일·30%",
"20대"에 걸린 "20Hz", "IPX4"에 걸린 "4시간", "7월 말"(28~31)에 걸린 "30만원".

적용 범위 — 평가셋 문항의 `entity_facts: true`(요청 주체의 회사·제품·행사를 쓰는 문항)만.
일반 지식 설명("2013년 출시"), 코드, 요청받은 계획(일정표 시간)의 숫자는 지어내기가 아니다.

못 잡는 것(알려진 한계): 숫자 없는 값 — 요일 "(수)", "수백만", "단독 오픈", 회사명·이메일.
"""

import re

from eval.placeholders import PLACEHOLDER_MASK, mask

# 단위 — 긴 것부터(‘시간’이 ‘시’보다, ‘만원’이 ‘원’보다 먼저 맞게)
_UNITS_KO = sorted("""
원 만원 억 억원 천원 년 개월 월 일 주 시간 시 분 초 명 개 장 잔 대 동 호기 호선 번 층 세 살 회 배 차 위
인분 평 퍼센트 페이지 쪽 자 줄 문장 권 곡 편 박 병 벌 켤레 그램 킬로 미터 센티
""".split(), key=len, reverse=True)
_UNIT_RE = "|".join(re.escape(u) for u in _UNITS_KO)
_NUM = re.compile(
    r"(?<![\w.:])"
    r"(\d{1,2}:\d{2}|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)"
    rf"(?:\s?(%|{_UNIT_RE}|[A-Za-z]{{1,4}}(?![A-Za-z])))?"
)
# 같은 뜻의 단위
_UNIT_ALIAS = {"h": "시간", "hr": "시간", "hrs": "시간", "hour": "시간", "hours": "시간",
               "퍼센트": "%", "만원": "만원", "min": "분", "mins": "분", "그램": "g", "g": "g"}
_CODE = re.compile(r"```.*?```|`[^`\n]*`", re.S)
# 구조용 숫자 — 목록 번호, 카드·단계·차수 번호, 제목 번호, 라벨 번호
_STRUCTURAL = [
    re.compile(r"^\s*(?:[-*#>]+\s*)?(?:\*\*)?\(?\d+[.)]\s", re.M),                 # "1. ", "2) ", "**1.** "
    re.compile(r"(?:Card|카드|Step|Day|Slide|슬라이드|Point|#)\s*\d+", re.I),
    re.compile(r"[가-힣A-Za-z]+\s*\d+\s*[:：]\s"),                               # "대안 1: ", "옵션 2: "
    re.compile(r"\d+\s*(?:단계|차|번째|일차|페이지|p\b)"),
    re.compile(r"\d+\s*[xX]{1,2}(?![A-Za-z])"),                                   # "20XX년" 날짜 자리표시자
    re.compile(r"(?:총|약|공백\s*포함|글자\s*수[:：]?)\s*\d[\d,]*\s*자"),          # "(총 198자)" 자기 분량 메모
    re.compile(r"\d+\s*가지"),                                                   # "3가지 버전으로" 답변 구성 설명
    re.compile(r"(?<![\d])0{2,}(?:-0{2,})*(?![\d])"),                           # "000-0000" 0으로 채운 자리
    re.compile(r"\[\s*\d+\s*/\s*\d+\s*\]"),                                   # "[1/5]" 카드 번호
]
# 결과물 끝의 사용 팁·참고 구역 — 결과물 자체가 아니라 사용자에게 주는 조언이다(Qwen·gpt-oss 모두 붙인다)
_TIPS_SECTION = re.compile(r"^[#>*\s]*(?:[^\w\s]\s*)?\**\s*(?:[\w\s/()]{0,20})?(?:팁|TIP|Tip|작성 요령|참고 사항|참고용)\b.*$", re.M)


def _unit(u: str | None) -> str | None:
    if not u:
        return None
    u = u.strip().lower() if u.isascii() else u.strip()
    return _UNIT_ALIAS.get(u, u)


def _norm(n: str) -> str:
    n = n.replace(",", "")
    if ":" in n:                                   # 시각 '09:00' ↔ '9:00'
        h, mm = n.split(":")
        return f"{int(h)}:{mm}"
    return n.lstrip("0") or "0"


def _given(query: str) -> tuple[set[tuple[str, str | None]], set[str], set[str]]:
    """요청에 준 값 — (숫자, 단위) 쌍, 단위 없이 준 숫자, 시각.
    'N시' 는 시각 'N:00' 으로도 받는다. 'N월 말' 은 그달 28~31'일'로 옮긴 것까지 허용한다."""
    pairs, bare, times = set(), set(), set()
    for m in _NUM.finditer(query):
        n = _norm(m.group(1))
        if ":" in n:
            times.add(n)
            continue
        u = _unit(m.group(2))
        pairs.add((n, u))
        if u is None:
            bare.add(n)
        if u == "시":
            times.add(f"{int(float(n))}:00")
    if re.search(r"\d+\s*월\s*말", query):
        pairs |= {(d, "일") for d in ("28", "29", "30", "31")}
    return pairs, bare, times


def _is_given(num: str, unit: str | None, given) -> bool:
    pairs, bare, times = given
    if ":" in num:
        return num in times
    if num in bare:                               # 단위 없이 준 숫자는 어떤 단위로 옮겨도 준 값
        return True
    if unit is None:                              # 단위 없이 쓴 숫자는 요청 어디에든 있으면 준 값
        return any(num == n for n, _ in pairs)
    return (num, unit) in pairs


def _structural_spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for p in _STRUCTURAL for m in p.finditer(text)]


def normalize_spaces(text: str) -> str:
    """좁은/줄바꿈 없는 공백(U+202F·U+00A0 등)을 보통 공백으로 — gpt-oss 는 '7월\\u202f15일' 처럼 쓴다."""
    return re.sub(r"[      　]", " ", text)


def invented_values(query: str, output: str) -> list[str]:
    """결과물에 있고 요청에는 없는 숫자 값 목록(나온 순서, 중복 제거).
    자리표시자·코드·구조용 번호는 제외한다."""
    body = _CODE.sub(" ", mask(normalize_spaces(output))).replace(PLACEHOLDER_MASK, " ")
    tips = _TIPS_SECTION.search(body)
    if tips and tips.start() > len(body) * 0.3:        # 앞부분이 통째로 '팁'인 결과물은 자르지 않는다
        body = body[:tips.start()]
    given = _given(normalize_spaces(query))
    skip = _structural_spans(body)
    found, seen = [], set()
    for m in _NUM.finditer(body):
        if any(a <= m.start() < b for a, b in skip):
            continue
        if _is_given(_norm(m.group(1)), _unit(m.group(2)), given):
            continue
        token = m.group(0).strip()
        if token not in seen:
            seen.add(token)
            found.append(token)
    return found
