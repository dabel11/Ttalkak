import os
import time
from google import genai
from google.genai import types
from google.genai.errors import ClientError

# ── 핵심 시스템 프롬프트 ─────────────────────────────────────
SYSTEM_PROMPT = """당신은 프롬프트 엔지니어링 전문가이며, 사용자와 '대화'를 통해 프롬프트를 점진적으로 다듬어 갑니다.

[대화 방식]
- 첫 턴: 사용자가 [원본 프롬프트]를 주면, [참고 기법]을 적용해 개선된 프롬프트를 제안합니다.
- 이후 턴: 사용자는 직전에 당신이 제안한 개선 프롬프트에 대한 '피드백'을 줍니다.
  (예: "더 짧게", "페르소나 빼줘", "예시를 추가해", "말투를 정중하게")
  이때는 직전 개선 프롬프트를 기준으로 피드백을 반영해 '갱신된' 개선 프롬프트를 다시 제안합니다.
- 항상 이전 대화 맥락(이미 적용한 기법, 직전 개선 프롬프트)을 기억하고 이어서 작업합니다.

[출력 형식] — 모든 턴에서 아래 형식을 반드시 지켜주세요:

---
**개선된 프롬프트:**

[여기에 개선된 프롬프트만 작성. 바로 AI에 붙여넣을 수 있게 완성된 형태로]

---
**적용한 기법:**
• [기법명]: [한 줄 설명]
• ...

**개선 포인트:**
[직전 버전 대비(첫 턴이면 원본 대비) 무엇이 어떻게 달라졌는지 2~3줄 설명]
---

[주의사항]
- 개선된 프롬프트는 실제로 사용할 수 있도록 완성된 형태여야 합니다
- 사용자의 피드백을 최우선으로 반영하되, 핵심 의도는 유지하세요
- 참고 기법에 없는 내용은 함부로 추가하지 마세요
- 피드백이 모호하면 합리적으로 해석해 반영하고, 무엇을 바꿨는지 '개선 포인트'에 적으세요"""


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
