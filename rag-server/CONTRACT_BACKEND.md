# 백엔드 담당자용 — `/api/prompts/improve` 설계 가이드

> **역할**: rag-server `POST /query`(AI 담당자 정의)를 감싸 프론트가 쓸
> `POST /api/prompts/improve`(Spring)를 정의한다.
> **참조**: `/query`의 요청·응답·에러 스키마 전체는 [`QUESTION_MODE_CONTRACT.md`](QUESTION_MODE_CONTRACT.md).
> 프론트가 최종적으로 받는 필드는 [`CONTRACT_FRONTEND.md`](CONTRACT_FRONTEND.md).
>
> 호출 경로: **Chrome 확장 → Spring(:8080) `/api/prompts/improve` → rag-server(:8000) `/query`**

---

## 1. 백엔드가 하는 일 (4가지)

최재원 규약: "로그인 확인 · DB 저장 · RAG 호출 · 응답 가공".

1. **로그인 확인** — `Authorization` 토큰 검증
2. **대화 이력 관리** — `conversationId`로 지난 대화를 DB에서 로드해 `/query`의 `history`로 전달.
   응답 후 유저 턴·assistant 턴을 저장 (assistant는 `answer` 마크다운을 저장)
3. **RAG 호출** — rag-server `POST /query`
4. **응답 가공** — `/query` 응답을 프론트용 형태로 매핑(snake_case → camelCase 등)

---

## 2. 제안 계약 (초안 — 최종 형태는 백엔드 담당자 결정)

### 요청 (프론트 → 백엔드)

```jsonc
POST /api/prompts/improve
Authorization: Bearer <token>
{
  "conversationId": 123,    // null이면 새 대화 생성
  "content": "좋은 글 써줘"   // 사용자 입력 (= /query 의 query 로 전달)
}
```

- 프론트가 **전체 history를 매번 보내지 않아도 되게** `conversationId`만 받고, history는
  백엔드가 DB에서 재구성하는 방식을 권장한다.

### 응답 (백엔드 → 프론트)

```jsonc
{
  "conversationId": 123,
  "messageId": 456,
  "mode": "ask",                  // /query.mode 그대로 (프론트 분기의 단일 기준)
  "summary": "…",
  "questions": ["주제: … (예: …)", "…"],   // ask 모드
  "improvedPrompt": "",           // improve 모드 (improved_prompt → camelCase)
  "techniquesApplied": [],
  "changes": [],
  "score": null,
  "answer": "…마크다운…"           // 폴백 렌더용, 함께 내려주면 안전
}
```

---

## 3. `/query` 호출 매핑

### 요청 매핑 (백엔드 → `/query`)

| `/query` 필드 | 값 | 비고 |
|---|---|---|
| `query` | `content` | 사용자 입력 그대로 |
| `history` | DB에서 로드한 `[{role, content}]` | user/assistant 만. assistant=이전 `answer` 마크다운 |
| `model` | 생략(기본 `gemini-2.0-flash`) | 바꿀 이유 없으면 기본값 |
| 나머지(top_k·min_score·use_* 등) | **생략(기본값)** | 검색·생성 튜닝 노브 — 백엔드가 건드릴 필요 없음 |

### 응답 매핑 (`/query` → 백엔드 → 프론트)

| `/query` 응답 | 프론트 응답 | 처리 |
|---|---|---|
| `mode` | `mode` | 그대로 |
| `summary` | `summary` | 그대로 |
| `questions` | `questions` | 그대로 |
| `improved_prompt` | `improvedPrompt` | snake→camel |
| `techniques_applied` | `techniquesApplied` | snake→camel |
| `changes` | `changes` | 그대로 |
| `score` | `score` | 그대로 |
| `answer` | `answer` | 그대로(폴백 렌더용) |
| `sources` | (선택) | 근거 표시 안 하면 생략 가능 |

> **⚠️ 절대 `answer`만 내려주지 말 것.** `mode`·`questions`·`summary`·`improvedPrompt`를
> 통과시켜야 프론트가 마크다운 되파싱 없이 분기·렌더한다. (이 계약의 핵심 목적)

---

## 4. 에러 매핑

`/query`가 내는 HTTP 상태를 백엔드 공통 에러 포맷으로 매핑하거나 그대로 전파한다.

| `/query` | 언제 | 백엔드 권장 처리 |
|---|---|---|
| `404` | 첫 턴(history 없음) 무관 입력 — 관련 기법 없음 | "관련 기법을 못 찾음" 안내. `detail` 전달 |
| `503` | LLM 생성 실패·빈 응답·호출 한도(429 소진) | "잠시 후 재시도" 안내. 재시도 유도 |
| `422` | 요청 스키마 위반 | 개발 단계 버그 — 서버 로그 |
| 연결 실패 | rag-server 다운 | 백엔드 5xx + 헬스체크(`GET /query`의 서버 `/health`) |

`/query` 에러 본문은 `{"detail": "…"}`(FastAPI 표준).

---

## 5. DB 저장 (대화 이력)

- **대화(conversation)** · **메시지(message)** 2 테이블 권장. message는 `role`(user/assistant),
  `content`, `mode`, 생성 메타(score 등)를 담을 수 있다.
- `/query`의 `history`는 저장된 message에서 **user/assistant 턴만** 시간순으로 재구성.
  assistant content에는 그 턴의 `answer`(마크다운)를 넣는다 — rag가 이전 맥락을 이어받는다.
- history 문자 예산은 rag 쪽에서 6000자로 컷(오래된 턴부터 폐기)하므로, 백엔드가 전량 보내도
  안전하다. 단 네트워크 절약을 위해 최근 N턴만 보내도 무방.

---

## 6. 다음 액션 (백엔드)

> ⚠️ **`/api/prompts/improve`는 이미 구현돼 있다**([PromptController.java:553](../backend/src/main/java/com/ttalkak/prompt/PromptController.java)).
> 이 문서의 §2~3 "제안"은 초기 설계 시안이고, 실제 구현/미해결 결정은
> [`CONTRACT_DECISIONS.md`](CONTRACT_DECISIONS.md)에 코드 근거와 함께 정리했다. **그 문서를 먼저 볼 것.**

- [ ] **[P0] `mode`·`questions`·`summary` 통과** — 현재 `buildImproveResponse`가 이 필드를 버려서
  질문 모드가 end-to-end로 깨져 있다(CONTRACT_DECISIONS §D1~D3).
- [ ] snake→camel 매핑: 이미 `firstNonBlank`/`firstList`가 양쪽 키를 읽으므로 신규 3필드만 추가.
- [ ] `/query` 404/503 매핑은 구현됨(404→no_evidence 200, 429→503).

### 입력 스키마 확장(`user_context`) — **결론: 저장형 폐기**

- **상황 종속 필드(persona·tone·platform·domain·형식)는 프로필로 저장하지 않는다.** 매 요청마다
  바뀌므로 저장하면 대부분 stale → 방해. 이 정보는 이미 `query`+`history`+질문 모드가 처리한다.
- 유일하게 남는 후보는 **`target_model`**(개선 프롬프트가 실행될 LLM) — 텍스트로 추론 불가하고
  덜 바뀐다. 단 **저장 프로필이 아니라 요청 단위**로만. 마침 프론트에 이미 `executeTarget`
  (claude/gemini/auto)가 있어([useConversation.js:190](../extension/src/hooks/useConversation.js)) 이걸
  요청에 실어 보내면 된다. **MVP엔 없어도 됨 — product 판단 후 필요 시 요청 단위 필드로 추가.**
