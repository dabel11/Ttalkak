import os
import time
from google import genai
from google.genai import types
from google.genai.errors import ClientError

import re

# 한글 단어에 '직접 붙어' 끼어든 한자(Han) 노이즈만 제거한다.
# (Groq 70b가 한글 출력에 간혹 한자를 글자에 붙여 토해내는 현상 대응)
# ⚠️ 공백·따옴표로 분리된 한자/일본어 등은 '번역·인용할 정상 원문'일 수 있으므로 보존.
#    → 한국어 음절에 직접 인접(공백 없음)할 때만 노이즈로 보고 제거한다.
_CJK_NOISE_RE = re.compile(
    r"(?<=[가-힣])[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+"
    r"|[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+(?=[가-힣])"
)


def _strip_cjk_noise(text: str) -> str:
    """한국어 출력에 섞여 들어온 한자 오염 문자를 제거."""
    if not text:
        return text
    return _CJK_NOISE_RE.sub("", text)


# ── 토큰 추정 (llama 토크나이저 실측 기반) ───────────────────
# 2026-07-23 usage.prompt_tokens 실측: 한국어 0.9~1.7 chars/tok(문체 편차 큼 — 고유명사
# 많은 구어체가 최악), 영어 5.4 chars/tok. 종전의 일괄 chars/3 은 한국어를 최대 2.3배
# 과소추정 → 413 방어가 뚫릴 수 있었다. 계수는 '과소추정 금지' 우선으로 최악 케이스에
# 맞춤(한글 /1.0, 영문·숫자·공백 /4, 기호·기타 /1.5) — 실측 4샘플에서 과소추정 ≤5%,
# 과대추정 +21~36%. 과대추정은 출력 예약만 줄이고(want=4096 여유로 평시 무영향) 413은
# 못 내므로 안전한 방향이다.
_HANGUL_RE = re.compile(r"[가-힣]")
_ASCII_RE  = re.compile(r"[a-zA-Z0-9 \n]")


def _est_tokens(text: str) -> int:
    """텍스트의 llama 토큰 수 추정 — 한글/영숫자·공백/기타를 분리해 계산."""
    if not text:
        return 0
    hangul = len(_HANGUL_RE.findall(text))
    ascii_ = len(_ASCII_RE.findall(text))
    other  = len(text) - hangul - ascii_
    return int(hangul / 1.0 + ascii_ / 4 + other / 1.5)


def _gen_temperature() -> float:
    """생성 temperature. GEN_TEMPERATURE 환경변수로 오버라이드(평가 비교용, 기본 0.7)."""
    try:
        return float(os.environ.get("GEN_TEMPERATURE", "0.7"))
    except ValueError:
        return 0.7


# ── Groq 429 재시도 정책 ─────────────────────────────────────
# 이 시간(초)을 넘는 대기 요구(TPD 소진 등)는 기다리지 않고 즉시 실패 → /query 는 503.
_RETRY_WAIT_CAP = 20.0
# Groq 429 메시지 예: "Please try again in 7.66s" / "in 2m59.56s"
_RETRY_AFTER_RE = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s")


def _retry_after_seconds(e: Exception) -> float:
    """Groq 429 에러에서 재시도 대기 시간(초)을 추출. 헤더 → 메시지 → 기본 8초."""
    try:
        v = e.response.headers.get("retry-after")
        if v:
            return float(v)
    except Exception:
        pass
    m = _RETRY_AFTER_RE.search(str(e))
    if m:
        return int(m.group(1) or 0) * 60 + float(m.group(2))
    return 8.0


# ── 핵심 시스템 프롬프트 ─────────────────────────────────────
SYSTEM_PROMPT = """당신은 프롬프트 엔지니어링 전문가이며, 사용자와 '대화'를 통해 프롬프트를 다듬어 갑니다.
Claude처럼, 곧바로 결과를 내놓기보다 필요할 때는 먼저 질문해 사용자의 의도를 파악합니다.

⚠️ 가장 중요한 원칙 — 당신은 '결과물'을 만드는 사람이 아니라, 그 결과물을 다른 AI가
만들도록 시키는 '프롬프트(명령문)'를 만드는 사람입니다.
예) 사용자가 "임영웅 콘서트 마케팅 글"의 정보를 주면,
  ❌ (틀림) "임영웅 콘서트가 7월 15일 개최됩니다! 티켓은…" ← 완성된 글을 직접 씀
  ✅ (맞음) "너는 공연 마케팅 카피라이터다. 아래 정보를 담아 임영웅 콘서트 홍보용
            인스타 카드뉴스 문구를 흥미진진한 단문 톤으로 작성하라.
            - 일시: 2026.07.15  - 티켓: 45,000원(공식 사이트)  - 포인트: 새 노래 …"
'개선된 프롬프트'는 항상 'AI에게 ~을 작성/생성하라'는 지시문이어야 하며,
사용자가 준 정보는 그 지시문 안의 '조건·재료'로 넣습니다. 절대 그 글 자체를 완성하지 마세요.

⚠️ 똑같이 중요한 원칙 — 사용자가 **변환·가공할 원문/자료를 직접 준 경우**(요약할 회의록,
번역할 문장·이메일, 리뷰할 코드, 분석할 데이터·표 등)에는, 그 원문을 개선된 프롬프트 안에
**원문 그대로(verbatim)** '조건·재료'로 반드시 포함하세요. 요약·바꿔쓰기·생략하거나
'(여기에 회의록 붙여넣기)' 같은 빈칸·플레이스홀더로 대체하는 것은 금지입니다 — 원문이 빠지면
다른 AI가 작업 자체를 수행할 수 없습니다(실패 예: "회의록 내용이 제공되지 않았습니다").
예) 사용자가 "다음 회의록을 3줄 요약해줘: '…회의록 본문…'" 라고 주면,
  ❌ (틀림) "아래 회의록을 결정사항·액션아이템 위주로 핵심 3줄로 요약하라." ← 정작 회의록 본문이 빠져 실행 불가
  ✅ (맞음) "너는 회의록 요약 전문가다. 아래 회의록을 결정사항·액션아이템 위주로 핵심 3줄로 요약하라.
            [회의록]
            오늘 신규 결제 모듈 일정 논의. 6월 말 QA 시작에 합의. …(사용자가 준 본문 전체를 그대로)…"
원문을 그대로 넣는 것은 '결과물을 직접 쓰는 것'이 아닙니다 — 지시문은 여전히 'AI에게 ~하라'이고,
사용자가 준 원문은 그 지시문 안의 재료일 뿐입니다. (정보·사실 나열형도 동일: 빠짐없이 모두 포함)
또한 변환·가공할 원문이 주어진 요청은 (A)작업 종류와 (B)대상 내용이 **이미 다 갖춰진** 것이므로,
목적·대상 독자·톤 같은 보조 항목을 캐묻지 말고 곧바로 [개선 모드]로 원문을 담은 개선안을 내세요.

당신은 매 턴 [질문 모드]와 [개선 모드] 중 하나를 선택합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[모드 선택] — 기본은 '개선', 질문은 예외
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
사용자는 빨리 더 나은 프롬프트를 받고 싶어 합니다. 따라서 **가능하면 곧바로 [개선 모드]**로
진행하고, [질문 모드]는 정말로 '무엇을 만들지'를 특정할 수 없을 때만 씁니다.

판정에 쓰는 '필수' 항목은 단 두 가지:
  (A) 작업 종류 — 무엇을 시키는가 (글쓰기/코드/요약/번역/기획 등)
  (B) 핵심 주제·소재 — 구체적으로 무엇에 대한 것인가 (대상 사물·사건·내용)

[질문 모드]는 다음 **한 가지 경우에만**:
- (A) 또는 (B)가 통째로 없거나 추상적이어서 **무엇을 만들지 특정할 수 없을 때.**
  예) "글 써줘", "마케팅 좀 도와줘", "이거 개선해줘", "기획안 만들어줘"
      → 주제가 비어 무엇에 대한 건지 모름 → 질문.

그 외 보조 항목(목적·맥락 / 대상 독자 / 형식·분량 / 톤·스타일 / 제약·필수포함)은
**질문의 사유가 되지 않습니다.** 비어 있어도 묻지 말고, 작업 성격에 맞는 합리적 기본값을
스스로 가정해 개선안을 만든 뒤, 가정한 부분만 "changes"에 한 줄로 명시하세요.

판정 예시:
- "임영웅 콘서트 마케팅 인스타 카드뉴스 문구, 7/15, 4.5만원, 새 앨범 곡 위주, 단문 톤"
   → (A)글쓰기 (B)콘서트 마케팅 문구 둘 다 있음. 대상 독자는 비었지만 보조 항목이므로
     **바로 개선 모드**(대상을 '임영웅 팬/일반 대중'으로 가정해 명시).
- "이 회의록을 3줄 요약하는 프롬프트" → (A)요약 (B)회의록 → **바로 개선 모드.**
- "코드 짜줘" → (A)는 있으나 (B)무슨 코드인지 없음 → 질문 모드.

원칙: **(A)와 (B)가 모두 특정되면 보조 정보가 부족해도 일단 개선안을 낸다.** 사용자는
개선안을 보고 "더 짧게/톤 바꿔" 식으로 다듬는 게, 처음부터 심문당하는 것보다 낫다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[질문 모드] — 컨텍스트가 부족할 때 (여러 턴에 걸쳐 OK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
빈 항목을 채우기 위해 **한 번에 1~3개**의 짧고 구체적인 질문을 하세요.
한 라운드로 부족하면 다음 턴에서 또 물어도 됩니다(최대 2~3라운드). 이미 받은 정보는 다시 묻지 마세요.

**핵심: 사용자가 '무슨 정보를 채워야 하는지' 한눈에 알게 하세요.** 각 질문은 다음 3요소를 갖춥니다.
  ① 채울 정보의 **이름(항목)**을 앞에 명시 (예: "대상 독자:", "주제:", "분량:")
  ② **왜 필요한지** — 그 정보가 결과 프롬프트를 어떻게 바꾸는지 한 조각
  ③ 답하기 쉬운 **보기/예시** 2~3개
  예) ❌ "누구를 위한 건가요?" (항목·이유·보기 없음, 추상적)
      ✅ "대상 독자: 누가 읽나요? 톤·난이도가 달라집니다. (예: 20대 잠재고객 / 사내 실무자 / 초등학생)"

"summary"에는 **파악한 작업 종류 + 무엇이 비어 특정 못 하는지**를 한 줄로 명시하세요.
  예) "'글쓰기' 요청은 파악했지만 '무엇에 대한 글'(주제)인지가 없어 개선안을 만들 수 없어요."

이때 JSON 출력: "mode"="ask", "questions"에 위 ①②③ 형식의 질문 1~3개,
"summary"에 위 한 줄. "improved_prompt"는 ""(개선안 절대 금지).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[개선 모드] — 기본 모드 ((A)와 (B)가 특정되면 바로 여기)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(A) 작업 종류와 (B) 핵심 주제·소재가 특정됐거나, 사용자가 "그냥 해줘 / 알아서 해줘"처럼
진행을 명시했거나, 질문 후 남은 공백이 보조 항목뿐일 때 → [참고 기법]을 적용해 개선안을 제시합니다.
(보조 정보가 비었으면 묻지 말고 합리적으로 가정 → "changes"에 명시)
이때 채우지 못해 가정한 부분은 "changes"에 반드시 명시하세요.

이때 JSON 출력: "mode"="improve" 로 하고,
- "improved_prompt": 'AI에게 작업을 시키는 지시문'만 작성한다. 결과물 자체를 쓰지 말 것.
  반드시 'AI에게 시키는 형태'(예: "…을 작성하라/생성하라")로 끝나고, 수집한 정보와
  사용자가 준 원문(요약·번역·리뷰 대상 텍스트/코드/데이터 등)은 빠짐없이 지시문 안의
  조건·재료로 포함한다(원문은 그대로 인용, 생략·플레이스홀더 금지).
  바로 다른 AI에 붙여넣어 쓸 수 있는 완결된 형태로.
- "techniques": 실제 적용한 [참고 기법] 1~5개, 각각 {"name": 기법명, "reason": 한 줄 적용 설명}.
- "changes": 직전 버전 대비(첫 턴이면 원본 대비) 무엇이 달라졌는지 + 채우지 못해 가정한 부분. 줄당 한 항목.
- "score": 원본 대비 개선 정도 자체 평가(1~10 정수).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[출력 형식 — 반드시 JSON 객체 하나만]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
모든 응답은 아래 스키마의 JSON 객체 **하나만** 출력합니다. 코드펜스(```)나 JSON 앞뒤의
설명 텍스트는 절대 금지. 이전 대화(assistant 턴)에 마크다운 형식 응답이 보이더라도,
그것은 화면 표시용 변환본이므로 지금 응답은 항상 이 JSON 형식으로만 냅니다.

{
  "mode": "improve" 또는 "ask",
  "improved_prompt": "improve: 지시문 전체(줄바꿈은 \\n) / ask: 빈 문자열",
  "techniques": [{"name": "기법명", "reason": "한 줄 적용 설명"}],
  "changes": ["개선 포인트·가정, 항목당 한 줄"],
  "score": 1,
  "summary": "한 줄 — improve: 무엇을 개선했는지 / ask: 파악한 작업 + 무엇이 비어 특정 못 하는지",
  "questions": ["ask일 때 질문 1~3개 — 각 '항목명: 질문 + 왜 필요한지 (예: 보기1 / 보기2)' 형식"]
}

- improve 모드: questions=[] · score는 1~10 정수. / ask 모드: improved_prompt="" ·
  techniques=[] · changes=[] · score=null.
- JSON 문자열 이스케이프(따옴표·줄바꿈)를 정확히 지킵니다. 유효하지 않은 JSON은 실패입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[대화 진행 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 이전 대화 맥락(이미 한 질문·답변, 적용한 기법, 직전 개선 프롬프트)을 항상 기억하고 이어갑니다.
- 같은 질문을 반복하지 마세요. 한 번 물었으면 답을 반영해 개선 모드로 넘어갑니다.
- 이미 개선안을 제시한 뒤 "더 짧게/페르소나 빼줘" 같은 피드백이 오면, 질문하지 말고
  직전 개선 프롬프트를 기준으로 피드백을 반영해 [개선 모드]로 갱신안을 냅니다.
- 컨텍스트가 부족한데 추측으로 개선안을 내놓는 것은 '실패'입니다. 확신이 없으면 먼저 물으세요.
- 단, 핵심이 다 채워졌는데도 사소한 것까지 끝없이 캐묻지는 마세요(질문 최대 2~3라운드).
- 참고 기법에 없는 내용은 함부로 추가하지 마세요. 핵심 의도는 항상 유지합니다."""


# 대화 기록 문자 예산 — 최신 턴부터 이 안에 들어오는 만큼만 유지(초과분은 오래된 턴부터 폐기).
# 상한이 없으면 스레드가 길어질수록 입력이 무한히 커져 _fit_max_tokens 가 출력 예약을
# 하한(512)까지 죽이고, 그마저 넘으면 413이 난다. verbatim 원문이 assistant 턴마다
# 반복 포함되는 구조라 실제로 밟기 쉬운 경로.
_HISTORY_CHAR_BUDGET = 6000


def _sanitize_history(history: list[dict] | None) -> list[dict]:
    """프론트에서 받은 대화 기록을 LLM messages 형식으로 정제.
    role 은 user/assistant 만 허용, 빈 내용·잘못된 role 은 제외.
    이후 문자 예산 컷 — 최신 턴부터 예산 안에서 유지하되, 턴 내용은 자르지 않는다
    (verbatim 원문 훼손 방지). 가장 최근 턴은 예산을 넘어도 반드시 남긴다."""
    if not history:
        return []
    clean = []
    for h in history:
        role    = (h.get("role") or "").strip()
        content = (h.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            clean.append({"role": role, "content": content})

    kept, used = [], 0
    for h in reversed(clean):
        if kept and used + len(h["content"]) > _HISTORY_CHAR_BUDGET:
            break
        kept.append(h)
        used += len(h["content"])
    return list(reversed(kept))


def _is_example(ctx: dict) -> bool:
    """검색 컨텍스트가 '개선 예시'(prompt_examples 컬렉션)인지 판정."""
    return (ctx.get("metadata") or {}).get("kind") == "example"


def _build_technique_context(contexts: list[dict]) -> str:
    parts = []
    for i, ctx in enumerate(contexts, 1):
        meta      = ctx.get("metadata", {})
        technique = meta.get("technique") or meta.get("source", f"기법 {i}")
        category  = meta.get("category", "")
        score     = ctx.get("score", 0)
        header    = f"[기법 {i}] {technique}"
        if category:
            header += f" ({category})"
        header += f" — 유사도 {score*100:.0f}%"
        parts.append(
            f"{header}\n{ctx['text']}"
            "\n→ 이 기법을 개선된 프롬프트에 구체적으로 인용하고 적용하라."
        )
    return "\n\n".join(parts)


def _build_example_context(contexts: list[dict]) -> str:
    """개선 예시(거친 요청→개선 프롬프트 사례) 컨텍스트를 렌더."""
    parts = []
    for i, ctx in enumerate(contexts, 1):
        meta  = ctx.get("metadata", {}) or {}
        task  = meta.get("task_type", "")
        score = ctx.get("score", 0)
        header = f"[예시 {i}]"
        if task:
            header += f" {task}"
        header += f" — 유사도 {score*100:.0f}%"
        parts.append(
            f"{header}\n{ctx['text']}"
            "\n→ 위 '개선된 프롬프트'의 구조·기법을 참고해 이번 요청을 같은 수준으로 "
            "개선하라(내용은 이번 요청에 맞게, 예시 내용을 복사하지 말 것)."
        )
    return "\n\n".join(parts)


def _build_context_blocks(contexts: list[dict]) -> str:
    """검색 컨텍스트를 '[참고 기법]' + (있으면) '[참고 예시]' 블록으로 조립.
    예시 컨텍스트(metadata.kind=='example')가 하나도 없으면 기존과 **완전히 동일한**
    '[참고 기법]\\n…' 문자열을 반환한다 → 개선 예시 도입 전 생성 경로 무회귀 보장."""
    techs = [c for c in contexts if not _is_example(c)]
    exs   = [c for c in contexts if _is_example(c)]
    blocks: list[str] = []
    if techs:
        blocks.append(f"[참고 기법]\n{_build_technique_context(techs)}")
    if exs:
        blocks.append(f"[참고 예시 — 유사 요청의 개선 사례]\n{_build_example_context(exs)}")
    return "\n\n".join(blocks)


# ── Groq 백엔드 ───────────────────────────────────────────────
class GroqGenerator:
    """Groq API 사용 (무료 14,400회/일, 매우 빠름)"""
    GROQ_MODEL_MAP = {
        "gemini-2.0-flash":  "llama-3.3-70b-versatile",
        "gemini-1.5-flash":  "llama-3.1-8b-instant",
        "gemini-1.5-pro":    "llama-3.3-70b-versatile",
    }
    # 무료 티어 TPM(분당 토큰) — Groq는 요청 크기를 '입력 + max_tokens(출력 예약)'로 계산
    TPM_LIMIT = {
        "llama-3.3-70b-versatile": 12000,
        "llama-3.1-8b-instant":    6000,
    }

    @classmethod
    def _fit_max_tokens(cls, groq_model: str, messages: list[dict], want: int) -> int:
        """입력 길이를 추정(_est_tokens — 한글/비한글 분리 실측 계수)해 TPM 예산 안에
        들어가는 max_tokens 를 계산. 긴 원문(회의록·코드)을 포함한 요청이 413(Request
        too large)으로 즉사하는 것을 방지하고, 짧은 입력이면 want(기본 4096)를 그대로
        쓴다. 하한 512. (종전 chars//3 일괄 추정은 한국어 과소추정 — 2026-07-23 보정)"""
        est_input = sum(_est_tokens(m.get("content") or "") for m in messages) + 100
        tpm = cls.TPM_LIMIT.get(groq_model, 12000)
        return max(512, min(want, tpm - est_input - 200))

    def __init__(self):
        from groq import Groq
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError("GROQ_API_KEY 환경변수를 설정해주세요.")
        self.client = Groq(api_key=api_key)
        print("[Generator] Groq 백엔드 초기화 완료")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 4096,
                 history: list[dict] | None = None) -> str:
        groq_model = self.GROQ_MODEL_MAP.get(model, "llama-3.3-70b-versatile")

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(_sanitize_history(history))

        if contexts:
            label = "원본 프롬프트" if not messages[1:] else "이번 요청"
            user_msg = f"{_build_context_blocks(contexts)}\n\n[{label}]\n{query}"
        else:
            # 후속 피드백 턴 — 검색 결과가 없으면 피드백만 전달
            user_msg = query
        messages.append({"role": "user", "content": user_msg})

        # TPM 예산 내로 출력 예약 동적 조정 (긴 원문 입력·8b TPM 6k에서 413 방지)
        max_tokens = self._fit_max_tokens(groq_model, messages, max_tokens)

        # 429는 대기시간이 짧으면 1회 재시도, 그 외 API 에러는 RuntimeError 로 변환
        # → main.run_generation 이 503 으로 매핑 (기존엔 groq 예외가 그대로 500).
        from groq import APIConnectionError, APIStatusError, RateLimitError

        for attempt in range(2):
            try:
                response = self.client.chat.completions.create(
                    model=groq_model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=_gen_temperature(),
                    response_format={"type": "json_object"},  # 구조화 출력 강제 (스키마는 SYSTEM_PROMPT)
                )
                return _strip_cjk_noise(response.choices[0].message.content)
            except RateLimitError as e:
                wait = _retry_after_seconds(e)
                if attempt == 0 and wait <= _RETRY_WAIT_CAP:
                    print(f"[Generator] Groq 429 — {wait:.1f}초 대기 후 재시도 (1/1)")
                    time.sleep(wait)
                    continue
                raise RuntimeError(
                    f"Groq 호출 한도 초과(429) — 약 {wait:.0f}초 후 재시도 가능합니다."
                ) from e
            except APIConnectionError as e:
                raise RuntimeError(f"Groq 연결 실패: {e}") from e
            except APIStatusError as e:   # 413(Request too large)·5xx 등
                raise RuntimeError(f"Groq 요청 실패(HTTP {e.status_code})") from e


# ── Gemini 백엔드 ─────────────────────────────────────────────
# ── Gemini 모델 해석 ─────────────────────────────────────────
# 이 계정의 Gemini 무료 티어에서 gemini-2.0-flash 는 limit 0(무료 호출 불가)이라, 폴백·장문
# 라우팅이 실행되면 즉시 실패해 /query 가 503이 됐다(2026-07-23 실측). 요청 model 이 무료
# 불가 모델이면 실제 호출 가능한 모델로 대체한다. GEMINI_MODEL 환경변수로 오버라이드 가능.
#   gemini-flash-latest      : 최신 flash(강함). 이 무료 티어에선 RPD 20 → 저트래픽 dev/폴백용.
#   gemini-flash-lite-latest : 무료 RPD가 더 관대(대량 폴백용) — 필요 시 GEMINI_MODEL 로 지정.
_GEMINI_UNAVAILABLE = {
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-pro",
}
_GEMINI_DEFAULT_MODEL = "gemini-flash-latest"


def _resolve_gemini_model(model: str) -> str:
    """요청 model 을 이 계정에서 실제 호출 가능한 Gemini 모델로 해석.
    GEMINI_MODEL 환경변수가 있으면 최우선, 없으면 무료 불가 모델을 기본 모델로 대체."""
    override = os.environ.get("GEMINI_MODEL")
    if override:
        return override
    if not model or model in _GEMINI_UNAVAILABLE:
        return _GEMINI_DEFAULT_MODEL
    return model


class GeminiGenerator:
    """Gemini API 사용 (무료 티어 모델·쿼터는 _resolve_gemini_model 참고)"""

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY 환경변수를 설정해주세요.")
        self.client = genai.Client(api_key=api_key)
        print("[Generator] Gemini 백엔드 초기화 완료")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 4096,
                 history: list[dict] | None = None) -> str:
        model = _resolve_gemini_model(model)   # 무료 불가 모델(gemini-2.0-flash 등) → 실제 되는 모델
        # 대화 기록을 contents 배열의 정식 턴으로 전달 (Groq messages 와 구조 동일).
        # 과거엔 system+대화를 한 문자열로 평탄화 → 멀티턴에서 role 경계가 사라져
        # 모델이 이전 assistant 응답을 자기 지시문으로 오인할 수 있었음 (리뷰 확인 항목).
        contents = []
        for h in _sanitize_history(history):
            role = "user" if h["role"] == "user" else "model"
            contents.append(types.Content(
                role=role, parts=[types.Part.from_text(text=h["content"])],
            ))

        if contexts:
            label = "원본 프롬프트" if not contents else "이번 요청"
            current = f"{_build_context_blocks(contexts)}\n\n[{label}]\n{query}"
        else:
            # 후속 피드백 턴 — 검색 결과가 없으면 피드백만 전달 (Groq 경로와 동일)
            current = query
        contents.append(types.Content(
            role="user", parts=[types.Part.from_text(text=current)],
        ))

        last_err = None
        for attempt in range(3):
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,        # 시스템 지시는 정식 채널로
                        max_output_tokens=max_tokens,
                        temperature=_gen_temperature(),          # Groq 경로와 동일 기본 0.7
                        response_mime_type="application/json",  # 구조화 출력 강제
                    ),
                )
                return _strip_cjk_noise(response.text)
            except ClientError as e:
                last_err = e
                err_str  = str(e)
                is_429   = "429" in err_str

                if not is_429:
                    raise

                if "PerDay" in err_str:
                    raise RuntimeError(
                        "⛔ Gemini 일일 한도 초과\n\n"
                        "GROQ_API_KEY를 설정하면 Groq(무료 14,400회/일)로 자동 전환됩니다.\n"
                        "① console.groq.com 에서 무료 키 발급\n"
                        "② .env 파일에 GROQ_API_KEY=발급받은키 추가\n"
                        "③ 서버 재시작"
                    ) from e

                retry_delay = 35
                try:
                    for d in (e.details or []):
                        if isinstance(d, dict) and d.get("@type", "").endswith("RetryInfo"):
                            retry_delay = int(str(d.get("retryDelay", "35s")).rstrip("s")) + 3
                except Exception:
                    pass
                print(f"[Generator] Gemini 429 — {retry_delay}초 대기 ({attempt+1}/3)...")
                time.sleep(retry_delay)

        raise RuntimeError("⛔ Gemini API 재시도 3회 초과") from last_err


# ── 장문 라우팅 판정 ─────────────────────────────────────────
def _needs_long_context(query: str, contexts: list[dict] | None,
                        history: list[dict] | None, groq_model: str) -> bool:
    """Groq TPM 예산으로 'verbatim 원문 포함 출력'이 불가능한 장문 입력인지 판정.
    개선 프롬프트는 사용자가 준 원문을 그대로 재인용해야 하므로, 필요 출력은
    최소한 원문 길이만큼이다 — 예산이 그에 못 미치면 잘림이 '보장'되는 구조.
    이 경우 컨텍스트가 큰 Gemini 로 보내는 것이 분할/요약 선처리보다 싸고 확실하다."""
    est_in = _est_tokens(SYSTEM_PROMPT) + _est_tokens(query) + 100   # _fit_max_tokens 와 동일 추정기
    est_in += sum(_est_tokens(h["content"]) for h in _sanitize_history(history))
    est_in += sum(_est_tokens(c.get("text") or "") + 60 for c in (contexts or []))
    avail_out  = GroqGenerator.TPM_LIMIT.get(groq_model, 12000) - est_in - 200
    needed_out = _est_tokens(query) + 600               # 원문 재인용 + 지시문·JSON 오버헤드
    return avail_out < needed_out


# ── 자동 선택 + 요청 단위 라우팅 Generator ────────────────────
class Generator:
    """
    백엔드 자동 선택 + 요청 단위 라우팅.
    - 기본: GROQ_API_KEY 있으면 Groq(빠름), 없으면 Gemini
    - 장문 라우팅: Groq TPM 예산으로 verbatim 출력이 불가능한 긴 원문은 Gemini 로
      (GEMINI_API_KEY 가 함께 설정된 경우에만 작동)
    - 폴백: Groq 실패(429 재시도 포함) 시 Gemini 가용하면 1회 폴백
    """

    def __init__(self):
        self._groq   = GroqGenerator()   if os.environ.get("GROQ_API_KEY")   else None
        self._gemini = GeminiGenerator() if os.environ.get("GEMINI_API_KEY") else None
        if not (self._groq or self._gemini):
            raise EnvironmentError(
                "GROQ_API_KEY 또는 GEMINI_API_KEY 중 하나를 .env에 설정해주세요."
            )
        self._using = "groq" if self._groq else "gemini"
        extra = " (+gemini 장문 라우팅·폴백)" if (self._groq and self._gemini) else ""
        print(f"[Generator] 백엔드: {self._using}{extra}")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 4096,
                 history: list[dict] | None = None) -> str:
        backend = self._groq or self._gemini

        if self._groq and self._gemini:
            groq_model = GroqGenerator.GROQ_MODEL_MAP.get(model, "llama-3.3-70b-versatile")
            if _needs_long_context(query, contexts, history, groq_model):
                print("[Generator] 장문 입력 → Gemini 라우팅 (Groq TPM 예산 부족)")
                backend = self._gemini

        try:
            return backend.generate(
                query=query, contexts=contexts,
                model=model, max_tokens=max_tokens,
                history=history,
            )
        except RuntimeError:
            if backend is self._groq and self._gemini:
                print("[Generator] Groq 실패 → Gemini 폴백")
                return self._gemini.generate(
                    query=query, contexts=contexts,
                    model=model, max_tokens=max_tokens,
                    history=history,
                )
            raise
