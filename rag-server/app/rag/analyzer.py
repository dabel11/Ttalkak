"""
analyzer.py
────────────────────────────────────────────────────────────
MAKE 파이프라인 1단계 — 요청 분석기.

사용자의 거친 요청을 보고 "이 작업을 하려면 어떤 정보(필드)가 필요한지"를
요청마다 **동적으로** 도출한다. 고정 표가 아니다.

2단계(생성기)와 분리한 이유: 분석은 결정적이어야 하고(temp 0.2) 생성은
자연스러워야 한다(temp 0.7) — 최적 온도가 반대다. 한 호출로 합치면 필드·mode
판정이 흔들린다(실측 2026-07-30: 한 호출 일관성 0.23~0.75, 분리 시 0.86~1.00).

필드 역할 3종 (규약 v3 §2):
  required — 비면 '무엇을 만드는지'가 안 정해져 결과물 자체가 불가
  fact     — 지어내면 거짓이 되는 구체값 (날짜·가격·수치·스펙·고유명사)
  framing  — 없으면 합리적으로 가정 가능 (톤·대상·분량·형식)

실패 시 None 을 반환한다 → 호출자는 분석 없이 기존 단일 단계로 진행(무회귀).

⚠️ **None 의 의미는 '분석 실패' 하나뿐이다.** 필드가 하나도 안 나왔더라도 축
(`techniqueAxes`)이 나왔으면 dict 를 돌려준다 — 축은 필드와 독립적인 산출물이고,
축 라우팅(DESIGN_TECHNIQUE_ROUTING.md)이 배선되면 이게 조회 경로의 입력이 된다.
필드만 비는 것은 생성 경로에서 이미 무회귀다(generator.build_analysis_block 이
빈 fields 를 analysis=None 과 똑같이 "" 로 처리한다).
"""

import json
import re
import os

from app.core.timeouts import FAST_SECONDS
from app.rag.axes import (
    MAX_AXES_PER_REQUEST, build_axis_catalog, normalize_axes,
)

_MODEL = "openai/gpt-oss-20b"   # 형식 판단이라 소형 모델로 충분. TPM 8000 주의.
_TEMPERATURE = 0.2                 # 결정성 우선 — 같은 입력 → 같은 필드/mode

# 🔴 2026-09-13: 이 둘이 없어서 **분석기가 사실상 전부 실패하고 있었다.**
# gpt-oss 계열은 최종 JSON 앞에 추론 토큰을 먼저 쓴다. 이 시스템 프롬프트(2,917자)에서
# 기본 추론량이 완료 토큰 ~1,259 라 종전 max_tokens=700 이 먼저 소진되고 Groq 가
# 400 json_validate_failed 를 낸다. 실측: 700 실패 / 1500 성공(완료 1259).
#   → gen_eval 18문항 중 16건에서 분석 실패가 찍혔다. analyze() 가 예외를 삼키고 None 을
#     돌려주므로 **에러 없이 조용히** 2단계 파이프라인이 1단계로 퇴화해 있었다
#     (2026-08-21 모델 교체 이후 줄곧).
#
# 그냥 예산만 올리면 TPM 이 죽는다 — Groq 는 '입력 + 출력예약'을 합산해 한도를 잡으므로
# max_tokens=1500 이면 요청당 ~3,100 토큰을 예약해 TPM 8000 에서 분당 2회가 한계다.
# reasoning_effort="low" 로 추론량 자체를 줄이는 것이 옳은 해법이다.
#   실측(같은 입력): low 완료 198 / medium 완료 1500 / high 실패
#   멀티턴(history 포함)에서도 완료 316~447 로 안정
_REASONING_EFFORT = "low"   # 형식 판단에 긴 추론이 필요 없다
_MAX_TOKENS = 1000          # low 기준 실사용 198~447 → 2배 이상 여유

# 주의: 구체적인 예시 하나를 길게 쓰면 8b가 그 예시를 무관한 요청에도 복사한다
# (실측: "환불 거절 이메일" 예시가 "글 써줘"의 taskType으로 새어나옴).
# → 작업유형별 required 를 '짧은 목록'으로만 주고, 특정 시나리오를 서술하지 않는다.
_SYSTEM = """너는 프롬프트 요청 '분석기'다. 사용자 요청을 읽고, 그 작업을 수행하는 데
필요한 정보(필드)를 도출해 JSON으로만 답한다. 결과물이나 개선안을 쓰지 마라.

[역할 3종]
- required: 이것이 비면 '무엇을 만드는지' 자체가 안 정해져 작업이 불가한 것.
- fact: 값을 지어내면 거짓이 되는 구체값.
- framing: 비어도 합리적으로 가정하면 되는 것. (톤·말투·대상 독자·분량·형식·스타일)

[status 판정 — 가장 중요]
요청 문장에 **조금이라도 단서가 있으면 filled** 이고, 그 표현을 value 에 그대로 적는다.
완벽히 구체적이지 않아도 filled 다. 지나치게 엄격하게 보지 마라.
  "제주도 여행 블로그 글 써줘"      → 주제 = filled("제주도 여행")   ← empty 아님
  "다이어트 식단 블로그 글 써줘"     → 주제 = filled("다이어트 식단")
  "신제품 무선 이어폰 제품 소개 글"  → 주제 = filled("신제품 무선 이어폰")
  "이 회의록을 3줄 요약하는 프롬프트" → 주제 = filled("회의록 요약")
  "글 써줘" / "기획안 만들어줘"      → 주제 = empty  ← 정말 아무 단서도 없을 때만

단, **결과물의 '종류'를 가리키는 말은 주제가 아니다.** 무엇에 '대한' 것인지가 있어야 filled 다.
  "발표 대본 만들어줘"   → 발표 주제 = empty   ('대본'은 결과물 종류일 뿐, 무슨 발표인지 없음)
  "제품 홍보 이메일 써줘" → 홍보 대상 = empty   ('제품'은 일반명사, 어떤 제품인지 없음)
  "자기소개서 써줘"      → 지원 직무 = empty
  "환불 거절 이메일 써줘" → 용건 = filled("환불 거절")  ← 무슨 이메일인지 특정됨

[작업유형별 required — 이 목록이 기준이다]
글쓰기/블로그: 주제 | 자기소개서: 지원 직무 | 이메일: 용건 | 발표: 발표 주제
코드: 구현할 기능 | 요약: 요약할 원문 | 번역: 원문, 목표 언어
마케팅/홍보: 홍보 대상 | SNS: 소재

[엄격 규칙]
1. required 는 위 목록에 해당하는 것만, **최대 2개**. 그 외는 전부 fact 또는 framing 이다.
2. "포함 핵심내용", "포함 내용", "상세 내용", "대안 제시" 같은 **뭉뚱그린 만능 필드를 만들지 마라.**
   실제로 필요한 구체 항목(예: 배터리 시간, 가격, 행사 일시)으로만 쓴다.
3. 어떤 값이 fact 인가: 지어내면 거짓이 되는 구체값(제품 스펙·기능·가격·일시·수치·고유명사·경력·통계).
   **단 이건 분류 기준일 뿐 필드명 목록이 아니다.** 이 요청에서 실제로 쓰이는 항목만 fact 로 만들어라.
   (예: 다이어트 식단 글에 '스펙'·'가격' 같은 무관한 fact 를 만들지 마라. 이어폰 소개 글이라면
    '배터리 시간'·'가격'이 실제로 필요하므로 fact 다.)
4. 대상 독자·톤·분량·형식은 항상 **framing** 이다.
5. 사용자가 원문을 실제로 붙여넣지 않고 "~하는 프롬프트를 만들어줘"라고 한 경우,
   그 원문은 required 가 아니다(템플릿 요청이므로 원문 없이도 개선 가능).
6. 이 요청에 실제로 쓰이는 필드만 도출하라. 요청과 무관한 필드를 지어내지 마라.
6-1. **완성된 결과물에 반드시 들어가야 하는 구체 정보가 요청에 없으면, 그것도 필드로 만들고
   status="empty" 로 표시하라.** 이것이 나중에 '빈칸'과 질문이 된다.
   (제품을 소개하는 글이라면 제품명·핵심 사양이 필요한데 요청에 없다 → 각각 empty.)
   ⚠️ **이렇게 추가하는 필드의 role 은 반드시 "fact" 다. 절대 required 로 만들지 마라.**
   required 는 [작업유형별 required] 목록의 항목뿐이며, 그 판정은 규칙 6-1 과 무관하게
   위 [status 판정] 기준을 그대로 따른다(요청에 단서가 있으면 filled).
7. 요청에 값이 있으면 status=filled 이고 value 에 그 값을 적는다. 없으면 empty, value=null.

[기법 축 — 이 요청에 어떤 종류의 지시문이 필요한가]
아래 목록에서만 고른다. 최대 {max_axes}개. 애매하면 적게 골라라.
목록에 없는 이름을 지어내지 마라. 해당 없으면 빈 배열.
{axis_catalog}

[출력 — JSON 하나만]
{"taskType":"작업유형","fields":[{"name":"필드명","role":"required|fact|framing","status":"filled|empty","value":"값 또는 null"}],"techniqueAxes":["축이름"]}"""
_SYSTEM = _SYSTEM.replace("{max_axes}", str(MAX_AXES_PER_REQUEST))
_SYSTEM = _SYSTEM.replace("{axis_catalog}", build_axis_catalog("request"))

_client = None
_init_failed = False


def _get_client():
    """Groq 클라이언트 1회 초기화. 키 없거나 실패하면 None."""
    global _client, _init_failed
    if _client is not None:
        return _client
    if _init_failed:
        return None
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        _init_failed = True
        return None
    try:
        from groq import Groq
        # 타임아웃 없으면 제공자가 멈췄을 때 스레드가 영원히 잡힌다(core/timeouts.py)
        _client = Groq(api_key=api_key, timeout=FAST_SECONDS)
        return _client
    except Exception as e:
        print(f"[Analyzer] 초기화 실패 → 분석 생략: {e}")
        _init_failed = True
        return None


# 규약의 '하드 제약'은 프롬프트가 아니라 코드로 강제한다.
# `llama-3.1-8b-instant` 는 프롬프트에 넣은 예시를 무관한 요청의 필드명으로 복사하는 성향이
# 강해서(실측: "환불 거절 이메일"→"글 써줘", "자기소개서"→"부산 여행 일정표"), 규칙을 문장으로만
# 주면 계속 새어나왔다. 아래 세 가지는 결정적으로 교정한다.
#
# 🔴 근거의 유효기간 주의 — 위 실측은 **폐기된 모델(llama-3.1-8b-instant)** 기준이다.
#    현재 `_MODEL` 은 `openai/gpt-oss-20b`(2026-08-21 교체)이고, 이 모델이 같은 오염 성향을
#    갖는지는 **재측정된 적이 없다.** 지금 이 규칙들은 (a) 여전히 필요하거나 (b) 필요 없는
#    교정을 하고 있거나 (c) 새 오염 유형을 놓치고 있는 셋 중 하나인데, 아직 알 수 없다.
#    → 판정을 가능하게 하려고 `_record_drop` 으로 **교정 발동을 관측 가능하게** 했다.
#      운영/평가 로그에서 규칙별 발동 횟수가 0 이면 그 규칙은 제거 후보,
#      특정 규칙만 계속 터지면 프롬프트 쪽을 고칠 신호다. `sanitize_stats()` 로 읽는다.
#    ⚠️ 규칙을 지우는 것은 이 관측 결과가 쌓인 뒤에 한다. 지금 지우면 8b 시절 회귀를
#      되살릴 뿐이고, 그게 회귀인지조차 판별할 수 없다.
_JUNK = ("포함 핵심내용", "포함 내용", "상세 내용", "대안 제시", "핵심내용")
# 주의: 부분 문자열로 매칭하면 안 된다 — "홍보 대상"(마케팅의 required)까지 framing 으로
# 강등돼 required 가 사라진다(실측: 마케팅 요청 3건이 ask→improve 로 오판). 정확 매칭 + '독자' 포함만.
_FRAMING_EXACT = {"대상", "대상 독자", "독자", "톤", "말투", "어조", "분량", "길이",
                  "형식", "포맷", "스타일", "문체"}
_TASK_WORDS = ("자기소개서", "이메일", "발표", "블로그", "기획안", "보고서", "코드",
               "번역", "요약", "마케팅", "SNS", "대본", "글쓰기")
_MAX_REQUIRED = 2

# 규칙별 교정 발동 횟수(프로세스 누적). 위 '근거의 유효기간' 참조 — 현재 모델에서
# 각 방어가 실제로 쓰이는지 판정하는 유일한 관측 창이다.
_SANITIZE_DROPS: dict[str, int] = {}


def _record_drop(rule: str, name: str) -> None:
    """방어 규칙이 모델 출력을 고쳤다는 사실을 남긴다(조용히 버리지 않는다)."""
    _SANITIZE_DROPS[rule] = _SANITIZE_DROPS.get(rule, 0) + 1
    print(f"[Analyzer] _sanitize 교정 {rule}: {name!r} ({_MODEL})")


def sanitize_stats() -> dict[str, int]:
    """규칙별 누적 교정 횟수 사본. 평가 스크립트·운영 점검에서 읽는다."""
    return dict(_SANITIZE_DROPS)


def reset_sanitize_stats() -> None:
    """카운터 초기화 — 측정 구간을 나눌 때 쓴다(테스트 격리에도 사용)."""
    _SANITIZE_DROPS.clear()


def _sanitize(fields: list) -> list:
    """모델 출력 정리 — 만능/오염 필드 제거 + 역할 강제 + required 상한.

    교정이 일어나면 `_record_drop` 으로 규칙명을 남긴다. 규칙 자체의 동작은
    종전과 동일하다(관측만 추가 — 무회귀)."""
    out = []
    for f in fields:
        if not isinstance(f, dict):
            _record_drop("not_dict", type(f).__name__)
            continue
        name = str(f.get("name") or "").strip()
        if not name:
            continue
        if name in _JUNK:
            _record_drop("junk", name)            # 만능 필드 → 항상 required+empty 로 강제 ask
            continue
        # 작업유형 자체를 필드로 만든 것은 예시 오염 → 폐기
        if name in _TASK_WORDS:
            _record_drop("task_word", name)
            continue
        role = str(f.get("role") or "").strip()
        if role not in ("required", "fact", "framing"):
            _record_drop("role_unknown", name)
            role = "framing"                      # 불명은 가장 안전한 쪽(가정 가능)으로
        # 규약 §2: 대상 독자·톤·분량·형식은 언제나 framing (모델이 required/fact 로 올려도 교정)
        if (name in _FRAMING_EXACT or "독자" in name) and role != "framing":
            _record_drop("framing_coerced", name)
            role = "framing"
        status = "filled" if str(f.get("status")) == "filled" else "empty"
        value = f.get("value")
        out.append({"name": name, "role": role, "status": status,
                    "value": value if status == "filled" else None})

    # 규약 §3-1: required 는 최대 2개. 초과분은 fact 로 강등(질문 대상은 되되 mode 를 막지 않음).
    seen = 0
    for f in out:
        if f["role"] != "required":
            continue
        seen += 1
        if seen > _MAX_REQUIRED:
            _record_drop("required_over_cap", f["name"])
            f["role"] = "fact"
    return out


# ── 규칙 5 를 코드로: 템플릿 요청의 '원문'은 required 가 아니다 ────────────
# "~하는 프롬프트 만들어줘"는 **작업 지시문을 만들어 달라**는 요청이다. 원문(번역·요약·리뷰할
# 재료)이 없어도 `[원문 입력]` 빈칸을 둔 채 완결된 지시문을 낼 수 있다(생성기 규약).
# 그런데 SYSTEM 의 [작업유형별 required] 목록이 "번역: 원문 | 요약: 요약할 원문"을
# '기준'으로 못박고 있어 규칙 5 와 정면으로 충돌하고, 모델은 목록 쪽을 따른다.
#   실측(2026-09-19, gpt-oss-20b): gen_set #8 "영어 이메일 번역 프롬프트" 5회 중 3회
#   `원문=required·empty` → 생성기가 ask("원문이 제공되지 않아") — 층 필터 A/B 의 mode 흔들림 원인.
# 교정 방향은 삭제가 아니라 **fact 로 강등**이다: fact·empty 는 생성기에서 "지어내지 말고
# [원문 입력] 빈칸 + 질문"으로 렌더되므로 원문 날조는 여전히 막히고, mode 만 막지 않는다.
#
# 템플릿 판별은 '프롬프트를 꾸미는 현재형 관형절'로 한다 — "요약하는 프롬프트",
# "번역하기 위한 프롬프트", "리뷰용 프롬프트". 과거형("내가 작성한 프롬프트")과
# 지시어("이 프롬프트")는 기존 프롬프트를 가리키므로 템플릿이 아니다. 뒤에 개선 동사가
# 오면("요약하는 프롬프트 개선해줘") 고칠 대상이 따로 있다는 뜻이라 역시 제외한다.
_TEMPLATE_RE = re.compile(r"(?:는|위한|용)\s*프롬프트")
_IMPROVE_AFTER_RE = re.compile(r"프롬프트\S*\s*(?:좀\s*)?(?:개선|고쳐|고치|다듬|수정|손봐|손 봐)")
_SOURCE_WORDS = ("원문", "원본", "본문", "텍스트")


def is_template_request(query: str) -> bool:
    """'~하는 프롬프트 만들어줘' 형태 — 원문 없이도 지시문을 완결할 수 있는 요청인가."""
    q = query or ""
    return bool(_TEMPLATE_RE.search(q)) and not _IMPROVE_AFTER_RE.search(q)


def is_source_field(name: str) -> bool:
    """변환·가공할 재료(원문) 필드인가 — 이름 기준. 생성기의 분석 블록 렌더도 이걸 쓴다."""
    return any(w in (name or "") for w in _SOURCE_WORDS)


def _exempt_template_source(query: str, fields: list[dict]) -> list[dict]:
    """템플릿 요청이면 비어 있는 '원문' 계열 required 를 fact 로 강등한다(규칙 5).

    채워진 원문(사용자가 실제로 붙여넣은 경우)은 건드리지 않는다 — 재료로 쓰여야 한다."""
    if not is_template_request(query):
        return fields
    for f in fields:
        if (f["role"] == "required" and f["status"] == "empty"
                and is_source_field(f["name"])):
            _record_drop("template_source_demoted", f["name"])
            f["role"] = "fact"
    return fields


def analyze(query: str, history: list[dict] | None = None) -> dict | None:
    """요청 → {"taskType", "fields":[{name, role, status, value}], "techniqueAxes":[…]}.

    None 은 **분석 실패**만 뜻한다(키 없음·호출 실패·JSON 파싱 실패·산출물 전무).
    필드가 비었지만 축이 있으면 dict 를 돌려준다 — 축은 축 라우팅의 입력이다."""
    client = _get_client()
    if client is None:
        return None

    user_msg = query
    if history:
        recent = [f"{h.get('role','')}: {h.get('content','')}" for h in history[-4:]
                  if h.get("content")]
        if recent:
            # 이전 턴에서 이미 채워진 값을 filled 로 잡아야 같은 질문을 반복하지 않는다.
            user_msg = "이전 대화:\n" + "\n".join(recent) + "\n\n이번 입력: " + query

    try:
        resp = client.chat.completions.create(
            model=_MODEL,
            temperature=_TEMPERATURE,
            max_tokens=_MAX_TOKENS,
            reasoning_effort=_REASONING_EFFORT,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": _SYSTEM},
                      {"role": "user", "content": user_msg}],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:
        print(f"[Analyzer] 분석 실패 → 분석 없이 진행: {e}")
        return None

    fields = _sanitize(data.get("fields") or [])
    # 판별은 **이번 입력**만 본다 — 멀티턴 후속 입력("격식체로")에는 관형절이 없어 적용되지
    # 않는다. 첫 턴에서 이미 강등돼 improve 로 갔다면 후속 턴은 개선안 다듬기라 무관하다.
    fields = _exempt_template_source(query, fields)
    # 통제 어휘 밖의 값은 버린다. 비면 호출자가 기존 유사도 경로로 폴백한다.
    axes = normalize_axes(data.get("techniqueAxes"))

    # 필드와 축은 독립적인 산출물이다. 예전엔 필드가 비면 무조건 None 이라 **축이 잘
    # 뽑혔어도 함께 폐기**됐다 — 축 라우팅이 배선되면 이건 조회 경로를 통째로 못 쓰게
    # 만드는 실질 버그가 된다. 이제 둘 다 비었을 때만 '분석 실패'로 본다.
    # 필드만 비는 경우의 생성 경로는 종전과 동일하다(build_analysis_block 이 빈 fields 를
    # analysis=None 과 똑같이 "" 로 처리 — generator.py:323).
    if not fields and not axes:
        return None
    return {
        "taskType": str(data.get("taskType") or ""),
        "fields": fields,
        "techniqueAxes": axes,
        # 생성기의 분석 블록이 빈 원문을 '되물을 것'이 아니라 '나중에 붙여넣을 빈칸'으로
        # 렌더하는 데 쓴다(generator.build_analysis_block). 응답의 fields 에는 안 나간다.
        "templateRequest": is_template_request(query),
    }


def derive_mode(fields: list[dict]) -> str:
    """필드 상태 → mode (규약 v3 §5). required 에 empty 가 있으면 ask, 아니면 improve.

    ⚠️ 이건 **분석기 품질을 재기 위한 참조 구현**이다. 실제 응답의 mode 는 2단계 생성기가
    [요청 분석] 블록을 보고 스스로 판정한다(생성기에도 동일 규칙이 SYSTEM_PROMPT 에 있음).
    end-to-end mode 정확도는 eval/gen_eval.py 로 따로 측정한다."""
    reqs = [f for f in fields if f.get("role") == "required"]
    if not reqs:
        return "improve"          # required 를 못 뽑았으면 막지 않는다(개선 우선)
    return "ask" if any(f.get("status") == "empty" for f in reqs) else "improve"


def empty_facts(fields: list[dict]) -> list[dict]:
    """빈칸(플레이스홀더)+질문 대상 — 비어 있는 fact 필드."""
    return [f for f in fields if f.get("role") == "fact" and f.get("status") == "empty"]
