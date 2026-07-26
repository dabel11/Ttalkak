# 백엔드 ↔ 프론트 정해야 할 사항 (코드 근거 기반 검토)

> `/api/prompts/improve`(Spring)와 확장(React)은 **이미 구현돼 있다.** 아래는 실제 코드를 읽고
> 도출한 **미해결 결정 + 결함** 목록이다. 근거는 `파일:줄`로 표기.
>
> 근거 파일: [PromptController.java](../backend/src/main/java/com/ttalkak/prompt/PromptController.java) ·
> [useConversation.js](../extension/src/hooks/useConversation.js) ·
> [normalizeImproveResult.js](../extension/src/utils/normalizeImproveResult.js) ·
> [prompts.js](../extension/src/api/prompts.js)

---

> 📌 계층 간 정본 계약(정렬 목표)은 [`CONTRACT_LAYERS.md`](CONTRACT_LAYERS.md). 이 문서는 그 정본에
> 도달하기 위한 **현재 결함·근거** 목록이다.

## 🔴 헤드라인: 질문 모드가 지금 end-to-end로 깨져 있다 (4계층 제각각)

내가 `/query`에 `mode`·`questions`·`summary`를 추가했지만, **아래 3계층이 서로 다른 계약을 가정한다:**

- **backend** — `mode`/`questions`를 아예 **버린다**(통과 안 함)
- **확장** — `mode`/`questions`를 **안 읽는다**(ragStatus만 봄)
- **웹**([normalizers.js:402](../prompt-hub-web-frontend/src/api/normalizers.js)) — `questions`는 읽지만 `mode==="question"`을
  기대한다. 그런데 rag는 `"ask"`를 낸다 → **값 불일치**로 트리거 안 됨(게다가 backend가 이미 차단)

즉 rag(`ask`) · backend(버림) · 확장(무시) · 웹(`question`) **4계층이 전부 다르다.** 결과:

1. rag가 질문 모드로 `{mode:"ask", improved_prompt:"", answer:"…질문들…", questions:[…], sources:[기법들]}` 반환
2. 백엔드 `buildImproveResponse`가 `improvedPrompt = firstNonBlank(improvedPrompt, improved_prompt, result, response, **answer**)`
   ([PromptController.java:781](../backend/src/main/java/com/ttalkak/prompt/PromptController.java#L781)) —
   `improved_prompt`가 ""라 **`answer`(질문 마크다운)로 폴백** → `improvedPrompt = 질문 텍스트`
3. `mode`/`questions`는 응답에 아예 안 담김. `ragStatus`는 sources가 있으니 `"ok"`
4. 프론트는 `executablePrompt = improvedPrompt`(질문 텍스트)라 **"실행" 버튼을 띄운다**
   ([ChatFeed.jsx:165](../extension/src/components/ChatFeed.jsx#L165)) → 사용자가 질문을 프롬프트로 실행

즉 "좋은 글 써줘" → 되묻긴 하지만 **질문을 개선 프롬프트로 오인**해 Execute가 뜬다. 아래 P0가 이걸 고친다.

---

## A. 현재 실제 계약 (관측값)

### 요청 (프론트 → 백엔드) — [ImproveRequest](../backend/src/main/java/com/ttalkak/prompt/PromptController.java#L1063)
```jsonc
POST /api/prompts/improve
Authorization: Bearer <token>        // 로그인 시
X-Session-UUID: <uuid>               // 게스트 시 ([prompts.js:14])
{
  "prompt": "좋은 글 써줘",           // 사용자 입력 (⚠️ content 아님)
  "category": "prompt_techniques",   // → /query collection_name (프론트 하드코딩)
  "threadId": 123,                   // 로그인+기존대화 (conversationId 별칭, 둘 다 허용)
  "messageId": "user-…",             // 메시지 수정 시에만
  "history": [{role, content}]       // ⚠️ 게스트만 — 로그인은 서버 DB에서 복원
}
```

### 응답 (백엔드 → 프론트) — [buildImproveResponse](../backend/src/main/java/com/ttalkak/prompt/PromptController.java#L778)
```jsonc
{
  "answer": "…마크다운…",
  "improvedPrompt": "…",             // ⚠️ ask 모드에선 질문 텍스트가 잘못 담김(위 P0)
  "sources": [...],
  "ragStatus": "ok" | "no_evidence", // 백엔드 자체 필드 (rag엔 없음)
  "techniquesApplied": [...],
  "changes": [...],
  "conversationId": 123, "threadId": 123,
  "editedMessageId": "…"             // 수정 시
  // ❌ mode / questions / summary / score 없음
}
```

### 이원 저장 구조 (이미 구현)
| | 로그인 | 게스트 |
|---|---|---|
| 대화 저장 | 서버 `MakeThread`(threadId, messagesJson) | 프론트 localStorage + 요청에 `history` 동봉 |
| history 출처 | 백엔드가 DB에서 복원 ([:623](../backend/src/main/java/com/ttalkak/prompt/PromptController.java#L623)) | 프론트가 매 요청 첨부 ([useConversation.js:226](../extension/src/hooks/useConversation.js#L226)) |
| 메시지 수정 | `messageId`로 truncate+재실행 | 프론트가 잘라 재호출 |

---

## B. 두 개의 상태 축이 충돌한다 (핵심 결정)

지금 응답에 상태 개념이 **두 개** 있고 서로 정합되지 않았다:

- **`ragStatus`** (백엔드): `ok` | `no_evidence` — **근거 검색** 축. 404(기법 못 찾음) 또는 sources 빈 경우
- **`mode`** (rag, 미노출): `improve` | `ask` — **생성 의도** 축

이 둘은 직교한다. 질문 모드는 sources가 있으니 `ragStatus="ok"`지만 `mode="ask"`다.
**결정 필요: 프론트 분기의 1차 기준을 무엇으로?**

> **권장**: `mode`를 **1차 축**으로. `ragStatus`(no_evidence)는 `improve`의 하위 상태로 격하.
> 분기 우선순위: `mode=="ask"` → 질문 렌더 · Execute 숨김 → 그다음 `ragStatus`로 improve의 근거유무 표시.

---

## C. 결정 매트릭스

### P0 — 질문 모드 정상화 (안 하면 기능 자체가 오작동)

| # | 쟁점 | 현재 | 권장 결정 | 담당 |
|---|---|---|---|---|
| D1 | `mode`·`questions`·`summary` 통과 | 백엔드가 버림 | `buildImproveResponse`에 3필드 추가(snake로 읽어 그대로) | 백 |
| D2 | ask 모드 `improvedPrompt` 오염 | `answer`로 폴백돼 질문이 담김 | **`mode=="ask"`면 `improvedPrompt=""` 강제**(answer 폴백 금지) | 백 |
| D3 | 프론트 ask 분기 | 없음(항상 improve 취급) | `mode=="ask"` → `summary`+`questions` 리스트 렌더, `executablePrompt=null` | 프 |
| D4 | 분기 우선순위 | ragStatus만 봄 | §B 권장(mode 1차) | 백·프 합의 |

### P1 — UI/UX 흐름

| # | 쟁점 | 현재 | 권장 결정 | 담당 |
|---|---|---|---|---|
| U1 | 질문에 어떻게 답하나 | — | **기존 composer 재사용** — 사용자가 자유 답변 입력 → `submitPrompt`(history에 ask턴 포함). 방식1과 정합 | 프 |
| U2 | ask 턴 history 포함 여부 | no_evidence는 `excludeFromHistory` | **ask 턴은 history에 포함**해야 함(rag가 이어받음). 절대 exclude 금지 | 프 |
| U3 | Execute 노출 조건 | `executablePrompt` truthy | ask면 null이라 자동 숨김(D2로 해결). improve만 노출 | 프 |
| U4 | 로딩 상태 | `isLoading`+`ragStatus="checking"` 있음 | 유지(스트리밍 불필요). ask/improve 공통 | — |
| U5 | 마크다운 렌더 | `content` 그대로 표시 | `questions`를 리스트로 보여주려면 마크다운/불릿 렌더 확인 필요 | 프 |
| U6 | 질문 라운드 상한 | 없음(무한 가능) | rag가 프롬프트로 2~3라운드 유도하지만, 프론트도 UX상 안전장치 고려 | 프 |

### P2 — 계약 정리 (기능엔 영향 적음)

| # | 쟁점 | 현재 | 권장 |
|---|---|---|---|
| C1 | `score` 노출 | 백엔드가 안 넘김 | 개선도 배지 원하면 통과(선택) |
| C2 | `conversationId` vs `threadId` | 둘 다 존재(별칭) | 신규 코드는 하나로 통일 권장 |
| C3 | `category` | 프론트 하드코딩 "prompt_techniques" | 지금은 고정으로 충분 |
| C4 | `sources` | 저장되나 렌더 여부 불명 | 근거 표시 UX 결정 |

---

## D. UI/UX 흐름 — 질문 모드 (방식1, 기존 채팅에 자연 통합)

```
[사용자] composer에 "좋은 글 써줘" 입력 → submitPrompt
   │  (로그인: threadId / 게스트: history 동봉)
   ▼
[백엔드] /query 호출 → { mode:"ask", questions, summary }  ← D1로 통과
   ▼
[프론트] mode=="ask" 감지 (D3)
   ├ assistant 말풍선에 summary + questions[] 리스트 렌더
   ├ executablePrompt = null → "실행" 버튼 숨김 (U3)
   └ ask 턴을 messages/history에 포함 (U2)
   ▼
[사용자] 같은 composer에 자유 답변 입력 (U1) → submitPrompt (history에 ask턴 포함)
   ▼
[백엔드→rag] history로 맥락 이어받아 → { mode:"improve", improvedPrompt }
   ▼
[프론트] mode=="improve" → improvedPrompt 표시 + "실행" 버튼 노출
```

핵심: **새 UI 컴포넌트가 거의 필요 없다.** 기존 composer·말풍선·history를 그대로 쓰고,
`mode` 분기 하나와 "ask면 executablePrompt=null" 규칙만 추가하면 된다.

---

## E. 합의 체크리스트 (한 줄 요약)

- [ ] **D1** 백엔드: `mode`/`questions`/`summary` 통과
- [ ] **D2** 백엔드: ask 모드 `improvedPrompt=""` 강제 (answer 폴백 차단)
- [ ] **D3** 프론트: `mode=="ask"` 분기 + questions 렌더 + Execute 숨김
- [ ] **D4/B** 백·프: `mode` 1차 축, `ragStatus`는 improve 하위상태로 합의
- [ ] **U2** 프론트: ask 턴 history 포함(exclude 금지)
- [ ] **U5** 프론트: questions 리스트 마크다운 렌더 확인
