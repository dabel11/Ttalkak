# 계층 간 통합 계약 (rag ↔ backend ↔ frontend) — 단일 진실 소스(SSOT)

> **이 문서가 기준이다.** backend·frontend 담당자는 이 계약에 맞춰 구현한다.
> 현재 4계층(rag / backend / 확장 / 웹)이 `mode`·`questions`를 **제각각** 다루어 질문 모드가
> end-to-end로 끊겨 있다(§7). 이 문서는 그 4계층을 **하나의 계약**으로 못박는다.
>
> 역할별 상세: [CONTRACT_BACKEND.md](CONTRACT_BACKEND.md) · [CONTRACT_FRONTEND.md](CONTRACT_FRONTEND.md)
> 결함·근거: [CONTRACT_DECISIONS.md](CONTRACT_DECISIONS.md) · rag 원계약: [QUESTION_MODE_CONTRACT.md](QUESTION_MODE_CONTRACT.md)

---

## 1. 계층과 책임 (한 줄씩)

```
[확장/웹] ──HTTP──▶ [backend :8080 /api/prompts/improve] ──HTTP──▶ [rag :8000 /query] ──▶ MySQL
   프론트                    Spring                                   FastAPI(AI)
```

| 계층 | 담당 | 책임 |
|---|---|---|
| **rag** `/query` | AI | 개선/질문 판정, `mode`·`questions`·`summary`·`improved_prompt` 방출 (**snake_case**) |
| **backend** `/improve` | 백엔드 | 인증·대화 저장·rag 호출·**필드 통과 + 이름 변환**(snake→camel) |
| **frontend** (확장·웹) | 프론트 | `mode`로 분기·렌더·답변 수집 후 재호출 |

**철칙**: rag가 낸 `mode`/`questions`/`summary`가 **끊기지 않고 프론트까지 도달**해야 한다.
지금은 backend가 중간에서 버려 끊긴다(§7). 이걸 잇는 게 이 계약의 핵심.

---

## 2. 정본 필드 계약 (canonical)

**값·이름을 여기서 고정한다.** 각 계층은 아래 이름/값만 쓴다.

| 의미 | rag→backend (snake) | backend→frontend (camel) | 값 / 규칙 |
|---|---|---|---|
| **분기 기준** | `mode` | `mode` | **`"ask"` \| `"improve"`** ← 정본. (웹의 `"question"` 폐기) |
| 개선 프롬프트 | `improved_prompt` | `improvedPrompt` | **ask면 반드시 `""`** (Execute 대상) |
| 추가 질문 | `questions` | `questions` | ask: 1~3개, `항목명: 질문 + 왜 (예: 보기)` / improve: `[]` |
| 한 줄 요약 | `summary` | `summary` | ask: 파악한 작업+무엇이 비었는지 / improve: 무엇을 개선했는지 |
| 적용 기법 | `techniques_applied` | `techniquesApplied` | improve만 |
| 개선 포인트 | `changes` | `changes` | improve만 |
| 자체 평가 | `score` | `score` | improve: 1~10 / ask: `null` |
| 검색 근거 | `sources` | `sources` | 청크 배열(표시는 선택) |
| **근거 상태**(파생) | — | `ragStatus` | `"ok"` \| `"no_evidence"` — backend가 만든 필드. **mode와 직교**(§4) |

> 단어 하나짜리 필드(`mode`,`questions`,`summary`,`changes`,`score`,`sources`)는 snake=camel이라
> 변환 불필요. 실제로 바뀌는 건 `improved_prompt→improvedPrompt`, `techniques_applied→techniquesApplied` 둘뿐.

---

## 3. 경계별 변환 규칙 (MUST)

### 경계 A — rag → backend (`buildImproveResponse`)
- **MUST** rag 응답의 `mode`·`questions`·`summary`를 읽어 응답에 실어보낸다. (지금 누락 — §7)
- **MUST NOT** `mode=="ask"`일 때 `improved_prompt`(빈 값)를 `answer`로 폴백하지 않는다.
  → ask면 `improvedPrompt=""`로 확정. (지금 폴백 때문에 질문 텍스트가 improvedPrompt로 샘)
- **MAY** `ragStatus`(ok/no_evidence)는 유지하되, 이는 §4의 2차 축.

### 경계 B — backend → frontend
- backend 응답 스키마(개선/질문 공통):
  ```jsonc
  { "mode", "answer", "summary",
    "improvedPrompt", "techniquesApplied", "changes", "score",   // improve
    "questions",                                                 // ask
    "sources", "ragStatus", "conversationId", "threadId" }
  ```
- `answer`(마크다운)는 **항상** 포함(폴백 렌더용). 하지만 프론트 분기는 `answer`가 아니라 `mode`로.

### 경계 C — frontend 렌더
- `mode=="ask"` → `summary` + `questions[]` 리스트 렌더 · **Execute 숨김**(`executablePrompt=null`) ·
  **ask 턴을 history에 포함**(rag가 자기 질문을 봐야 함, exclude 금지)
- `mode=="improve"` → `improvedPrompt` 표시 · Execute 활성
- **웹**은 `mode==="question"` 체크를 **`"ask"`로 변경**([normalizers.js:402](../prompt-hub-web-frontend/src/api/normalizers.js)) — 렌더 로직은 이미 있음

---

## 4. 상태 축 2개의 우선순위 (충돌 해소)

응답에 상태 개념이 둘 있고 **직교**한다. 프론트 분기 우선순위를 고정한다:

| | `mode` (생성 의도) | `ragStatus` (근거 검색) |
|---|---|---|
| 값 | `ask` / `improve` | `ok` / `no_evidence` |
| 출처 | rag | backend 파생(404 또는 sources 빈 경우) |

**규칙: `mode`가 1차, `ragStatus`는 improve의 하위 상태.**

```
if mode == "ask":        질문 렌더 (ragStatus 무시)
else:  # improve
    if ragStatus == "no_evidence":  "근거 없이 기본 개선" 안내 + 개선안
    else:                            일반 개선안
```

(질문 모드는 sources가 있어 `ragStatus="ok"`가 나온다 → ragStatus만으론 질문/개선 구분 불가. 그래서 `mode` 우선.)

---

## 5. end-to-end 예시 (각 홉의 실제 JSON)

### 질문 모드 — "좋은 글 써줘"
```jsonc
// ① 프론트 → backend
{ "prompt": "좋은 글 써줘", "category": "prompt_techniques" }   // 게스트면 +history / 로그인이면 +threadId

// ② backend → rag /query
{ "query": "좋은 글 써줘", "collection_name": "prompt_techniques", "top_k": 5, "history": [...] }

// ③ rag → backend  (snake)
{ "mode": "ask", "improved_prompt": "", "summary": "‘글쓰기’지만 주제 없음",
  "questions": ["주제: 무엇에 대한 글? 방향이 정해집니다 (예: 여행후기/제품소개)"],
  "techniques_applied": [], "changes": [], "score": null,
  "answer": "**확인이 필요해요 🤔**\n…", "sources": [ {기법…} ] }

// ④ backend → 프론트  (camel, 통과 + ask 가드)
{ "mode": "ask", "improvedPrompt": "", "summary": "‘글쓰기’지만 주제 없음",
  "questions": ["주제: 무엇에 대한 글? …"],
  "answer": "**확인이 필요해요 🤔**\n…", "ragStatus": "ok",
  "techniquesApplied": [], "changes": [], "score": null,
  "conversationId": 12, "threadId": 12 }

// ⑤ 프론트: mode=="ask" → questions 리스트 렌더, Execute 숨김, ask턴 history 포함
//    사용자가 답 입력 → ①로 재호출(history에 ask턴 포함) → 다음엔 mode:"improve"
```

### 개선 모드 — "이 회의록 3줄 요약 프롬프트"
```jsonc
// ③ rag → backend
{ "mode": "improve", "improved_prompt": "너는 요약 전문가다. 아래 회의록을 3줄로…",
  "techniques_applied": ["Role Prompting"], "changes": ["역할 부여"], "score": 8,
  "summary": "역할·분량 지정", "questions": [], "answer": "---\n**개선된 프롬프트:**\n…", "sources": [...] }

// ④ backend → 프론트
{ "mode": "improve", "improvedPrompt": "너는 요약 전문가다. …", "summary": "역할·분량 지정",
  "techniquesApplied": ["Role Prompting"], "changes": ["역할 부여"], "score": 8, "questions": [],
  "answer": "---\n**개선된 프롬프트:**\n…", "ragStatus": "ok", "conversationId": 12, "threadId": 12 }

// ⑤ 프론트: mode=="improve" → improvedPrompt 표시 + Execute 활성
```

---

## 6. 에러 계약 (계층 관통)

| rag `/query` | backend 처리 | 프론트 |
|---|---|---|
| `404` (무관 입력, 기법 없음) | `200` + `ragStatus:"no_evidence"`, `improvedPrompt=원문` (현행) | "근거 없이 기본 개선" 안내 |
| `503` (생성 실패·한도) | `503` `AI_SERVICE_UNAVAILABLE` / `AI_RATE_LIMIT_EXCEEDED` | "잠시 후 재시도" |
| 연결 실패 | `503` | 네트워크 안내 |

> 참고: 현재 404는 backend가 200(no_evidence)으로 흡수한다. 질문 모드(`mode:"ask"`)와는 **다른 경로**다
> (404는 개선 기법 자체가 없는 것, ask는 기법은 있으나 요청이 모호한 것).

---

## 7. 계층별 적합성 체크리스트 (현재 상태 → 목표)

| 계층 | 현재 | 해야 할 일 | 상태 |
|---|---|---|---|
| **rag** | `mode`/`questions`/`summary` 방출, ask면 `improved_prompt=""` | — | ✅ 완료(미커밋·컨테이너 재기동 필요) |
| **backend** | 3필드 버림 + ask에서 answer 폴백 | §3-A: 3필드 통과 + ask면 `improvedPrompt=""` | ⬜ **P0 병목** |
| **확장** | `mode`/`questions` 안 읽음 | §3-C: `normalizeImproveResult`+`useConversation`에 ask 분기 | ⬜ |
| **웹** | `mode==="question"` 기대(불일치) | §3-C: `"question"`→`"ask"` (렌더 로직은 이미 있음) | ⬜ (한 줄 수정) |

**순서**: backend(병목)를 먼저 뚫어야 프론트 수정이 효과를 낸다. rag는 이미 계약을 만족한다.

---

## 부록 — 근거 (코드 위치)

- rag: `app/main.py` `QueryResponse`·`run_generation` / `app/rag/postprocess.py` `assemble_fields`
- backend: [`PromptController.buildImproveResponse`](../backend/src/main/java/com/ttalkak/prompt/PromptController.java) (통과 누락·answer 폴백)
- 확장: [`normalizeImproveResult.js`](../extension/src/utils/normalizeImproveResult.js) (mode 미독) / [`useConversation.js`](../extension/src/hooks/useConversation.js)
- 웹: [`normalizers.js`](../prompt-hub-web-frontend/src/api/normalizers.js) (`mode==="question"` 불일치, 렌더 로직 존재)
