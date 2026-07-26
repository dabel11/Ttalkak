# 프론트엔드 담당자용 — 개선/질문 모드 렌더 가이드

> **역할**: 백엔드 `POST /api/prompts/improve` 응답을 받아 **개선 모드/질문 모드**를 화면에
> 반영하고, 질문 모드면 답을 모아 다시 호출한다.
> **참조**: 호출하는 API 스키마는 [`CONTRACT_BACKEND.md`](CONTRACT_BACKEND.md), 원 계약은
> [`QUESTION_MODE_CONTRACT.md`](QUESTION_MODE_CONTRACT.md).
>
> ⚠️ 프론트는 rag `/query`를 **직접 부르지 않는다.** 항상 백엔드 `/api/prompts/improve`를 부른다.
>
> 🔴 **현재 상태**: 확장([useConversation.js](../extension/src/hooks/useConversation.js))은 아직
> `mode`/`questions`를 읽지 않아 **질문 모드를 개선 모드로 오작동**시킨다. 아래는 목표 계약이고,
> 실제 결함·수정 항목은 [`CONTRACT_DECISIONS.md`](CONTRACT_DECISIONS.md)의 D3/U1~U5를 볼 것.

---

## 1. 분기의 단일 기준은 `mode`

응답의 **`mode`** 값 하나로만 분기한다. `improvedPrompt==""` 같은 추측은 하지 말 것(계약으로
`mode`를 명시했다).

| `mode` | 화면 | Execute 버튼 |
|---|---|---|
| `"improve"` | 개선된 프롬프트 표시 | **활성** |
| `"ask"` | 추가 질문(방식1 리스트) 표시 | **숨김** |

---

## 2. 개선 모드 (`mode == "improve"`)

쓰는 필드: `improvedPrompt`(필수) · `techniquesApplied` · `changes` · `score` · `summary`.

- `improvedPrompt` — 최종 프롬프트. **Execute로 이 값을 다른 LLM에 붙여넣는다.**
- `summary` — "무엇을 개선했는지" 한 줄 (헤더로 쓰기 좋음)
- `techniquesApplied` — 적용 기법 태그
- `changes` — 개선 포인트·가정(예: "대상 독자를 일반 대중으로 가정") 목록
- `score` — 개선도 자체평가(1~10). 배지로 표시 가능
- `answer`(마크다운)를 그대로 렌더해도 되지만, 위 필드로 조립하면 UI를 자유롭게 꾸밀 수 있다.

---

## 3. 질문 모드 (`mode == "ask"`) — 방식1(리스트) 채택

> **결정**: 방식1(ChatGPT식 리스트)로 진행. 방식2(카드)·방식3(배너)는 **보류**.

쓰는 필드: `summary`(무엇이 비었는지) · `questions[]`(추가 질문).

**렌더 (택1)**
- **(A) 가장 간단**: `answer` 마크다운을 그대로 렌더 — 헤더/안내문구/질문 불릿이 이미 들어있음.
- **(B) 구조화 권장**: `summary` 한 줄 + `questions[]`를 번호/불릿 리스트로. 마크다운 파싱 불필요.
  → 생성 포맷이 바뀌어도 안 깨진다. `questions`가 빈 폴백이면 `answer`로 저하.

**질문 형식** — 각 질문은 `항목명: 질문 + 왜 필요한지 (예: 보기)` 로 온다. 그대로 보여주면
"무슨 정보를 채워야 하는지"가 사용자에게 바로 전달된다. 예:
```
아래 정보를 알려주시면 이어서 만들어 드릴게요:
• 주제: 무엇에 대한 글인가요? 글의 방향이 정해집니다. (예: 여행 후기 / 제품 소개 / 에세이)
• 대상 독자: 누가 읽나요? 톤·난이도가 달라집니다. (예: 20대 고객 / 사내 동료)
• 분량: 어느 정도 길이인가요? (예: 3줄 / 한 문단 / A4 1장)
```

---

## 4. 왕복 흐름 (질문 → 개선)

```
① 사용자 입력 → POST /api/prompts/improve { content }
      → { mode:"ask", questions:[…] }
② questions 를 리스트로 렌더 → 사용자 답변 수집
③ 답변을 content 로 → POST /api/prompts/improve { conversationId, content:"여행 후기, 20대, 3문단" }
      → { mode:"improve", improvedPrompt:"…" }
④ improvedPrompt 표시 + Execute 활성
```

- **매 턴 `mode`만 보고 동일하게 분기**한다. ②~③이 다시 `mode:"ask"`로 올 수 있다(최대 2~3라운드).
- `conversationId`를 유지해 넘기면, 이전 질문·답변은 백엔드가 기억한다. 프론트가 전체 대화를
  다시 보낼 필요 없다.

---

## 5. Execute 조건 · 폴백

- **Execute 노출 = `mode=="improve"` 이고 `improvedPrompt`가 비지 않음.**
- 드물게 `mode=="ask"`인데 `questions`가 비면(생성 폴백) → `answer` 마크다운을 그대로 렌더.
- 에러: 백엔드가 내려주는 상태/메시지에 따라 "관련 기법 못 찾음"(404 계열) / "잠시 후 재시도"
  (503 계열) 안내.

---

## 6. 다음 액션 (프론트)

- [ ] `mode` 분기 컴포넌트 (improve / ask)
- [ ] 질문 모드 방식1 리스트 렌더 (`summary` + `questions[]`)
- [ ] 답변 수집 → `conversationId` 유지하며 재호출
- [ ] Execute 노출 조건 + 에러 안내
