import os
import time
from google import genai
from google.genai import types
from google.genai.errors import ClientError

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

당신은 매 턴 [질문 모드]와 [개선 모드] 중 하나를 선택합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[충분한 컨텍스트 체크리스트] — 개선 전에 반드시 점검
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
좋은 프롬프트를 만들려면 아래 항목이 충분히 파악돼야 합니다. 매 턴, 지금까지의 대화에서
각 항목이 '채워졌는지' 스스로 점검하세요.

  1) 작업 종류 — 무엇을 시키는가 (글쓰기/코드/요약/번역/기획 등)
  2) 핵심 주제·소재 — 구체적으로 무엇에 대한 것인가 (예: '이벤트 안내'라면 무슨 이벤트? 일시·장소·대상?)
  3) 목적·맥락 — 왜 필요한가, 어디에 쓰이는가
  4) 대상 독자 — 누가 읽는가 (전문가/일반인/고객 등)
  5) 형식·분량 — 어떤 형태로, 얼마나 (글머리표/표/문단, 글자·문장 수)
  6) 톤·스타일 — 격식/캐주얼/설득적 등
  7) 제약·필수 포함/금지 사항 — 꼭 넣을 것, 빼야 할 것

판정 기준:
- 위 항목 중 **결과를 크게 좌우하는 핵심 항목이 2개 이상 비어 있으면 → [질문 모드]**.
- 특히 (2) 핵심 주제·소재가 모호하면(추상적 단어만 있으면) 반드시 먼저 묻습니다.
- 사용자의 답이 짧고 단어 나열이어도(예: "이벤트 안내, 일반 대중, 단문") 그것만으로
  핵심 사실(무슨 이벤트인지, 들어갈 정보가 뭔지)이 안 채워지면 **계속 추가 질문**하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[질문 모드] — 컨텍스트가 부족할 때 (여러 턴에 걸쳐 OK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
빈 항목을 채우기 위해 **한 번에 1~3개**의 짧고 구체적인 질문을 하세요.
한 라운드로 부족하면 다음 턴에서 또 물어도 됩니다(최대 2~3라운드). 추상적으로 묻지 말고,
사용자가 답하기 쉽게 보기/예시를 함께 제시하세요. 이미 받은 정보는 다시 묻지 마세요.

이때 출력 형식 (개선 프롬프트 블록을 절대 넣지 말 것):

**확인이 필요해요 🤔**
[지금까지 파악한 내용 한 줄 요약 + 왜 더 묻는지]
• [질문 1] (예: A / B / C)
• [질문 2]
• [질문 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[개선 모드] — 컨텍스트가 충분할 때만
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
체크리스트 핵심 항목이 대체로 채워졌거나, 사용자가 "그냥 해줘 / 알아서 해줘"처럼 진행을
명시했거나, 2~3라운드 질문 후 남은 공백이 사소할 때 → [참고 기법]을 적용해 개선안을 제시합니다.
이때 채우지 못해 가정한 부분은 '개선 포인트'에 반드시 명시하세요.

이때 출력 형식:

---
**개선된 프롬프트:**

[여기에는 'AI에게 작업을 시키는 지시문'만 작성한다. 결과물 자체를 쓰지 말 것.
 반드시 'AI에게 시키는 형태'(예: "…을 작성하라/생성하라")로 끝나고,
 수집한 정보는 지시문 안의 조건·재료로 포함한다. 바로 다른 AI에 붙여넣어 쓸 수 있는 형태로.]

---
**적용한 기법:**
• [기법명]: [한 줄 설명]
• ...

**개선 포인트:**
[직전 버전 대비(첫 턴이면 원본 대비) 무엇이 어떻게 달라졌는지 2~3줄 설명]
---

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


def _sanitize_history(history: list[dict] | None) -> list[dict]:
    """프론트에서 받은 대화 기록을 LLM messages 형식으로 정제.
    role 은 user/assistant 만 허용, 빈 내용·잘못된 role 은 제외."""
    if not history:
        return []
    clean = []
    for h in history:
        role    = (h.get("role") or "").strip()
        content = (h.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            clean.append({"role": role, "content": content})
    return clean


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
        parts.append(f"{header}\n{ctx['text']}")
    return "\n\n".join(parts)


# ── Groq 백엔드 ───────────────────────────────────────────────
class GroqGenerator:
    """Groq API 사용 (무료 14,400회/일, 매우 빠름)"""
    GROQ_MODEL_MAP = {
        "gemini-2.0-flash":  "llama-3.3-70b-versatile",
        "gemini-1.5-flash":  "llama-3.1-8b-instant",
        "gemini-1.5-pro":    "llama-3.3-70b-versatile",
    }

    def __init__(self):
        from groq import Groq
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError("GROQ_API_KEY 환경변수를 설정해주세요.")
        self.client = Groq(api_key=api_key)
        print("[Generator] Groq 백엔드 초기화 완료")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 2048,
                 history: list[dict] | None = None) -> str:
        groq_model = self.GROQ_MODEL_MAP.get(model, "llama-3.3-70b-versatile")

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(_sanitize_history(history))

        if contexts:
            technique_text = _build_technique_context(contexts)
            label = "원본 프롬프트" if not messages[1:] else "이번 요청"
            user_msg = f"[참고 기법]\n{technique_text}\n\n[{label}]\n{query}"
        else:
            # 후속 피드백 턴 — 검색 결과가 없으면 피드백만 전달
            user_msg = query
        messages.append({"role": "user", "content": user_msg})

        response = self.client.chat.completions.create(
            model=groq_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return response.choices[0].message.content


# ── Gemini 백엔드 ─────────────────────────────────────────────
class GeminiGenerator:
    """Gemini API 사용 (무료 1,500회/일, 일일 한도 주의)"""

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY 환경변수를 설정해주세요.")
        self.client = genai.Client(api_key=api_key)
        print("[Generator] Gemini 백엔드 초기화 완료")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 2048,
                 history: list[dict] | None = None) -> str:
        # 대화 기록을 텍스트로 풀어 프롬프트에 포함
        convo = ""
        for h in _sanitize_history(history):
            who   = "사용자" if h["role"] == "user" else "어시스턴트"
            convo += f"\n[{who}]\n{h['content']}\n"

        if contexts:
            technique_text = _build_technique_context(contexts)
            label = "원본 프롬프트" if not convo else "이번 요청"
            current = f"[참고 기법]\n{technique_text}\n\n[{label}]\n{query}"
        else:
            current = f"[이번 요청(피드백)]\n{query}"

        prompt = f"{SYSTEM_PROMPT}\n"
        if convo:
            prompt += f"\n=== 지금까지의 대화 ==={convo}\n=== 이번 턴 ===\n"
        prompt += f"\n{current}"

        last_err = None
        for attempt in range(3):
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(max_output_tokens=max_tokens),
                )
                return response.text
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


# ── 자동 선택 Generator ───────────────────────────────────────
class Generator:
    """
    GROQ_API_KEY 가 있으면 Groq 우선 사용,
    없으면 Gemini 사용 (일일 한도 있음)
    """

    def __init__(self):
        if os.environ.get("GROQ_API_KEY"):
            self._backend = GroqGenerator()
            self._using   = "groq"
        elif os.environ.get("GEMINI_API_KEY"):
            self._backend = GeminiGenerator()
            self._using   = "gemini"
        else:
            raise EnvironmentError(
                "GROQ_API_KEY 또는 GEMINI_API_KEY 중 하나를 .env에 설정해주세요."
            )
        print(f"[Generator] 백엔드: {self._using}")

    def generate(self, query: str, contexts: list[dict],
                 model: str = "gemini-2.0-flash", max_tokens: int = 2048,
                 history: list[dict] | None = None) -> str:
        return self._backend.generate(
            query=query, contexts=contexts,
            model=model, max_tokens=max_tokens,
            history=history,
        )
