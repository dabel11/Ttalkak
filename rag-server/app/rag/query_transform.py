"""
query_transform.py
────────────────────────────────────────────────────────────
검색 전 쿼리 변환.

사용자가 입력하는 '개선 대상 프롬프트'(예: "마케팅 글 써줘")는 그 자체로는
기법 검색용 쿼리로 적합하지 않다. 빠른 LLM(Groq openai/gpt-oss-20b)으로
"이 프롬프트를 개선하는 데 필요한 프롬프트 엔지니어링 기법"을 가리키는
짧은 검색 쿼리/키워드로 바꿔 검색 정확도를 올린다.

어떤 이유로든 실패하면(키 없음·오류·타임아웃) 원본 쿼리를 그대로 반환해
검색이 절대 끊기지 않게 한다.
"""

import os

from app.core.timeouts import FAST_SECONDS

_TRANSFORM_MODEL = "openai/gpt-oss-20b"
# HyDE는 '추론 품질'이 아니라 '기법 카드 장르로 문체를 맞추는 것'이 목적이라 8b로 충분하다.
# 실측(2026-07-29): 8b HyDE가 6개 거친 쿼리를 dense 0.69~0.84로 끌어올려(baseline 0.34~0.48)
# 오히려 70b(0.65~0.68)보다 높고 폴백 0건. 70b는 일일 토큰 한도(TPD)에 걸려 429로 원본 폴백됨.
_HYDE_MODEL      = "openai/gpt-oss-20b"

# 🔴 2026-09-13: 이 설정이 없어서 **두 함수 모두 아무것도 하지 않고 있었다.**
# gpt-oss 계열은 최종 출력 앞에 추론 토큰을 먼저 쓴다. 종전 예산(transform 120 /
# hyde 300)은 추론에서 전부 소진돼 `message.content` 가 **빈 문자열**로 돌아왔다.
#   실측(같은 입력): transform 120 → 완료 120·content 0자 / hyde 300 → 완료 300·content 0자
#
# ⚠️ analyzer·tag_axes·tag_layers 와 **증상이 다르다**. 그쪽은 JSON 모드라
#    `400 json_validate_failed` 로 시끄럽게 터졌지만, 여기는 `response_format` 이 없어
#    조용히 빈 응답이 되고 `return query` 폴백으로 흡수된다 — **에러 로그조차 안 남는다.**
#    "실패해도 검색이 안 끊긴다"는 무회귀 설계가 또 한 번 장애를 은폐했다.
#
# 해법은 예산 증액이 아니라 추론량 감축이다(Groq 는 입력+출력예약을 합산해 TPM 을 잡는다).
#   effort=low 실측: transform 완료 117·content 127자 / hyde 완료 112·content 416자
_REASONING_EFFORT = "low"
_TRANSFORM_MAX_TOKENS = 600   # 실사용 117 → 5배 여유(history 포함 대비)
_HYDE_MAX_TOKENS      = 800   # 실사용 112, 출력이 3~5문장이라 여유를 더 둠

# HyDE: 키워드 확장(미스매치) 대신 '기법 카드처럼 생긴 가상 문서'를 생성해 임베딩한다.
# 코퍼스(기법 청크)와 글의 모양이 비슷해져 검색이 살아난다.
_HYDE_SYSTEM = """너는 '프롬프트 엔지니어링 기법 사전'의 항목을 쓰는 작성자다.
사용자의 거친 요청을 보고, 그 요청을 개선하는 데 쓸 프롬프트 기법을 설명하는
짧은 '가상 사전 항목'을 작성한다.

규칙:
- 결과물 자체(예: 마케팅 글)를 쓰지 마라. '기법 설명'만 쓴다.
- 실제 기법명이 떠오르면 쓰고(예: Role Prompting, Chain-of-Thought, Output Format,
  Few-Shot, Audience, Constraint), 없으면 일반 원칙으로.
- 아래 형식, 3~5문장, 군더더기 없이.

Technique: <기법명들>
Definition: <무엇인지>
Use When: <이런 요청일 때>"""

_SYSTEM = """너는 '프롬프트 엔지니어링 기법' 벡터 검색을 위한 검색 쿼리 생성기다.
사용자가 입력한 '개선 대상 프롬프트'를 보고, 이 프롬프트를 더 좋게 만드는 데
도움이 될 프롬프트 엔지니어링 기법을 찾기 위한 짧은 검색 쿼리를 만든다.

규칙:
- 결과물/답변을 쓰지 마라. 오직 '기법을 가리키는 핵심 키워드·구절'만 출력한다.
- 한 줄, 쉼표로 구분된 키워드 형태로. (예: 역할 부여, 대상 독자 지정, 출력 형식, 톤 스타일)
- 작업 종류(글쓰기/코드/요약 등)와 필요한 통제 요소(형식·길이·톤·예시·근거 등)를 추론해 담아라.
- 설명·접두어 없이 키워드 줄만 출력한다."""

_client = None
_init_failed = False


def _get_client():
    """Groq 클라이언트를 1회만 초기화. 키 없거나 실패하면 None."""
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
        _client = Groq(api_key=api_key, timeout=FAST_SECONDS)
        return _client
    except Exception as e:
        print(f"[QueryTransform] 초기화 실패 → 원본 쿼리 사용: {e}")
        _init_failed = True
        return None


def transform(query: str, history: list[dict] | None = None) -> str:
    """개선 대상 프롬프트 → 기법 검색용 쿼리. 실패 시 원본 반환."""
    client = _get_client()
    if client is None:
        return query

    user_msg = query
    if history:
        # 후속 피드백 턴: 직전 맥락을 짧게 덧붙여 의도 반영
        recent = [h.get("content", "") for h in history[-2:] if h.get("content")]
        if recent:
            user_msg = "이전 맥락: " + " / ".join(recent) + "\n이번 입력: " + query

    try:
        resp = client.chat.completions.create(
            model=_TRANSFORM_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=_TRANSFORM_MAX_TOKENS,
            reasoning_effort=_REASONING_EFFORT,
            temperature=0.3,
        )
        out = (resp.choices[0].message.content or "").strip()
        return out if out else query
    except Exception as e:
        print(f"[QueryTransform] 변환 실패 → 원본 쿼리 사용: {e}")
        return query


def hyde(query: str, history: list[dict] | None = None) -> str:
    """HyDE: 기법 카드형 가상 문서를 생성해 '원본 + 가상문서'를 검색 쿼리로 반환.
    가상문서가 코퍼스(기법 청크)와 모양이 닮아 매칭이 살아난다. 실패 시 원본."""
    client = _get_client()
    if client is None:
        return query

    user_msg = query
    if history:
        recent = [h.get("content", "") for h in history[-2:] if h.get("content")]
        if recent:
            user_msg = "이전 맥락: " + " / ".join(recent) + "\n이번 입력: " + query

    try:
        resp = client.chat.completions.create(
            model=_HYDE_MODEL,
            messages=[
                {"role": "system", "content": _HYDE_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=_HYDE_MAX_TOKENS,
            reasoning_effort=_REASONING_EFFORT,
            temperature=0.3,
        )
        doc = (resp.choices[0].message.content or "").strip()
        # 원본 쿼리 신호를 유지하면서 가상문서로 보강(견고한 HyDE 변형)
        return f"{query}\n{doc}" if doc else query
    except Exception as e:
        print(f"[QueryTransform] HyDE 실패 → 원본 쿼리 사용: {e}")
        return query
