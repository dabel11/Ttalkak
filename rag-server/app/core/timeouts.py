"""
timeouts.py
────────────────────────────────────────────────────────────
LLM 호출 타임아웃 예산.

왜 필요한가: 종전에는 Groq·Gemini 호출 어디에도 타임아웃이 없었다. 제공자가
응답을 주지 않으면 **스레드가 무한 대기**한다. FastAPI 는 `def` 엔드포인트를
스레드풀(기본 40)에서 돌리므로, 제공자가 느려지면 스레드가 쌓여 서버가 멎는다.
백엔드에 75초 WebClient 타임아웃이 있어 사용자에게는 에러가 가지만,
**rag-server 쪽 스레드는 계속 붙잡혀 있다** — 같은 결함이 백엔드에서는
2026-08 에 고쳐졌고 여기만 남아 있었다.

예산 계산 (백엔드 `rag.response-timeout` = 75s 안에 들어가야 한다):
    검색(리랭커 포함)   ~5s
    [C0] 분석기         1회   → FAST
    [C]  생성기         1회   → GEN   (+429 재시도 / Gemini 폴백은 별도)
  한 번 통과 기준 5 + 20 + 45 = 70s 로 75s 안에 들어온다.

⚠️ 재시도·폴백까지 겹치면 75s 를 넘을 수 있다. 그건 **의도된 상한이 아니라
   남은 한계**다 — 그때는 백엔드가 먼저 끊고 사용자에게 503 이 간다. 여기서
   막으려는 것은 '느림'이 아니라 **'영원히 안 끝남'** 이다.

환경변수로 덮을 수 있다: RAG_LLM_TIMEOUT_FAST / RAG_LLM_TIMEOUT_GEN (초).
"""

import os


def _seconds(name: str, default: float) -> float:
    raw = os.environ.get(name, "")
    try:
        value = float(raw)
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


# 분석기·쿼리변환 — 짧은 프롬프트에 짧은 출력. 느리면 그냥 포기하는 편이 낫다
# (둘 다 실패 시 폴백이 있어 기능은 유지된다).
FAST_SECONDS = _seconds("RAG_LLM_TIMEOUT_FAST", 20.0)

# 생성기 — 긴 원문을 verbatim 으로 되돌려야 해서 출력이 길다.
GEN_SECONDS = _seconds("RAG_LLM_TIMEOUT_GEN", 45.0)

# google-genai 는 밀리초를 받는다(groq/httpx 는 초).
GEN_MILLIS = int(GEN_SECONDS * 1000)
