# 질문 모드 계약 — `/query` API (프론트·백엔드 담당자용)

> RAG는 매 턴 **개선 모드**(바로 개선안 제시)와 **질문 모드**(정보 부족 → 되묻기) 중 하나로
> 응답한다. 질문 모드일 때 **프론트가 무엇을·어떻게 보여줄지**를 응답 필드로 확정한다.
> (배경: 최재원 2026-07-12 — mode가 계약에 없어 프론트가 제각각 구현하던 문제 해소)
>
> 호출 경로: **Chrome 확장 → Spring `/api/prompts/improve` → rag-server `/query`**
> 이 문서는 **AI 담당자가 정의하는 `/query` 계약**이며, 백엔드는 이 필드들을 프론트로
> **그대로 통과**시키면 된다(가공 지침 §6).

> **진행 상태 (2026-07-23)** — 프론트 UI는 **방식1(리스트) 채택 · 방식2/3 보류**(§7).
> 변경 전 계약(mode/questions 없던 시절)으로도 **방식1 + 왕복은 이미 충분히 동작**했다
> (`answer` 마크다운 렌더 + `improved_prompt==""`로 Execute 숨김). 이번 변경의 초점은 UI 확장이
> 아니라 **방식1 강화** 두 가지다: ① `mode` 명시로 '빈 문자열 추측' 제거, ② 질문 모드에서
> **'어떤 작업엔 어떤 정보를 채워야 하는지'를 질문마다 명확히 표시**(§1 하단).

---

## 1. 두 모드 한눈에

| | **개선 모드** `mode:"improve"` | **질문 모드** `mode:"ask"` |
|---|---|---|
| 언제 | (A)작업종류·(B)핵심주제가 특정됨(기본) | (A) 또는 (B)를 알 수 없음(예외) |
| 핵심 필드 | `improved_prompt`, `techniques_applied`, `changes`, `score` | `questions[]`, `summary` |
| 프론트 | 개선 프롬프트 표시 + **Execute 활성** | 질문 렌더 + **Execute 숨김** |
| 예 | "이 회의록 3줄 요약 프롬프트", "임영웅 콘서트 인스타 문구…" | "좋은 글 써줘", "코드 짜줘", "기획안 만들어줘" |

**mode 판정 기준(RAG 내부)** — 필수 항목은 단 둘:
- **(A) 작업 종류**: 무엇을 시키는가 (글쓰기/코드/요약/번역/기획 …)
- **(B) 핵심 주제·소재**: 구체적으로 무엇에 대한 것인가

(A)·(B)가 모두 특정되면 **개선 모드**. 목적·대상독자·톤·분량 같은 **보조 항목은 질문 사유가
아니다** — 비어도 합리적 기본값을 가정하고 개선안을 낸 뒤 가정을 `changes`에 명시한다.
(A) 또는 (B)가 통째로 없거나 추상적일 때만 **질문 모드**.

### 질문 모드: '채워야 할 정보'를 명확히 표시 (방식1 강화)

질문 모드일 때 각 질문은 사용자가 **무슨 정보를 채워야 하는지 한눈에** 알도록 3요소를 갖춘다:

```
항목명: 질문 + 왜 필요한지 (예: 보기1 / 보기2 / 보기3)
```

- ① **항목명** — 채울 정보의 이름을 앞에 (`주제:`, `대상 독자:`, `분량:` …)
- ② **왜** — 그 정보가 결과 프롬프트를 어떻게 바꾸는지 한 조각
- ③ **보기** — 답하기 쉬운 예시 2~3개

`summary`는 **파악한 작업 종류 + 무엇이 비어 특정 못 하는지**를 한 줄로 담는다. 이렇게 하면
방식1(리스트) 렌더만으로도 "이 작업을 하려면 이런 정보가 필요하다"가 바로 전달된다.

---

## 2. 요청 (Request) — `POST /query`

```jsonc
{
  "query": "좋은 글 써줘",              // (필수) 사용자 입력. 질문 모드 답변 재호출 시에도 여기에
  "history": [                          // (선택) 대화 기록 [{role, content}, ...]
    {"role": "user",      "content": "…이전 사용자 발화…"},
    {"role": "assistant", "content": "…이전 assistant 응답(마크다운 answer 그대로)…"}
  ],
  "model": "gemini-2.0-flash",          // (선택) 기본 gemini-2.0-flash
  "top_k": 5, "min_score": 0.40         // (선택) 검색 파라미터 — 기본값 권장
  // 그 외 use_reranker/use_hybrid/use_examples 등은 RAG_PIPELINE.md 참조 (기본값 유지 권장)
}
```

- `history`는 **멀티턴의 핵심**이다. 질문 모드 후 사용자가 답하면, 그 답을 `query`에 담고
  **이전 턴들을 `history`에 포함**해 다시 호출한다(§5). `assistant` 턴 content는 직전 응답의
  `answer`(마크다운)를 그대로 넣는다.

---

## 3. 응답 (Response) — `QueryResponse`

**모든 응답에 공통**으로 `mode`와 `answer`가 있다. `mode`가 **분기의 단일 기준**이다.

```jsonc
{
  "mode": "improve",          // "improve" | "ask"  ← 이 값으로만 분기(improved_prompt로 추측 금지)
  "answer": "…마크다운…",      // 화면 표시용. 항상 렌더 가능한 폴백(구조화 필드 못 쓰면 이걸 표시)
  "summary": "…한 줄 요약…",   // 두 모드 공통(있을 수 있음). improve: 무엇을 개선했는지 / ask: 파악내용+왜 묻는지

  // ── mode=="improve" 일 때 채워짐 ──
  "improved_prompt": "너는 …다. …을 작성하라. …",  // Execute로 보낼 최종 프롬프트. ask면 ""
  "techniques_applied": ["Role Prompting", "Length Control"],
  "changes": ["역할 부여", "분량 3줄로 제한", "대상 독자를 일반 대중으로 가정"],
  "score": 8,                 // 원본 대비 개선도 자체평가(1~10). ask면 null
  "sources": [ { "text": "…기법 청크 발췌…", "metadata": {…}, "score": 0.62 } ],

  // ── mode=="ask" 일 때 채워짐 ──
  "questions": ["어떤 주제의 글인가요?", "독자는 누구인가요?", "원하는 분량은?"]  // improve면 []
}
```

### 필드별 규칙

| 필드 | improve | ask | 설명 |
|---|---|---|---|
| `mode` | `"improve"` | `"ask"` | **분기 기준** |
| `answer` | 마크다운 | 마크다운 | 항상 존재. 안전판 렌더 |
| `improved_prompt` | 지시문 | `""` | **비면 Execute 숨김** |
| `techniques_applied` | 기법명[] | `[]` | 적용 기법 |
| `changes` | 개선점[] | `[]` | 변경·가정 |
| `score` | 1~10 | `null` | 자체평가 |
| `summary` | 있을 수 있음 | 있을 수 있음 | 한 줄 요약 |
| `questions` | `[]` | 질문 1~3개 | **질문 모드 렌더 소스** |
| `sources` | 청크[] | 청크[] | 검색 근거(디버그·근거표시용) |

### 질문 모드 응답 예

각 질문이 `항목명: 질문 + 왜 + (보기)` 형식이라, 리스트로만 렌더해도 무엇을 채워야 할지 명확하다.

```json
{
  "mode": "ask",
  "answer": "**확인이 필요해요 🤔**\n‘글쓰기’ 요청은 파악했지만 ‘무엇에 대한 글’(주제)인지가 없어 개선안을 만들 수 없어요.\n아래 정보를 알려주시면 이어서 만들어 드릴게요:\n• 주제: 무엇에 대한 글인가요? 글의 방향이 정해집니다. (예: 여행 후기 / 제품 소개 / 에세이)\n• 대상 독자: 누가 읽나요? 톤·난이도가 달라집니다. (예: 20대 고객 / 사내 동료)\n• 분량: 어느 정도 길이인가요? (예: 3줄 / 한 문단 / A4 1장)",
  "summary": "‘글쓰기’ 요청은 파악했지만 주제가 비어 무엇을 쓸지 특정 불가",
  "improved_prompt": "",
  "techniques_applied": [], "changes": [], "score": null,
  "questions": [
    "주제: 무엇에 대한 글인가요? 글의 방향이 정해집니다. (예: 여행 후기 / 제품 소개 / 에세이)",
    "대상 독자: 누가 읽나요? 톤·난이도가 달라집니다. (예: 20대 고객 / 사내 동료)",
    "분량: 어느 정도 길이인가요? (예: 3줄 / 한 문단 / A4 1장)"
  ],
  "sources": []
}
```

### 개선 모드 응답 예

```json
{
  "mode": "improve",
  "answer": "---\n**개선된 프롬프트:**\n\n너는 공연 마케팅 카피라이터다. …\n---\n**적용한 기법:**\n• Role Prompting: 역할 부여\n…",
  "summary": "역할·형식·필수정보를 지시문으로 구조화",
  "improved_prompt": "너는 공연 마케팅 카피라이터다. 아래 정보를 담아 임영웅 콘서트 홍보용 인스타 카드뉴스 문구를 흥미진진한 단문 톤으로 작성하라.\n- 일시: 2026.07.15\n- 티켓: 45,000원",
  "techniques_applied": ["Role Prompting", "Tone Specification"],
  "changes": ["역할 부여", "톤을 ‘흥미진진한 단문’으로 지정", "대상 독자를 ‘임영웅 팬/일반 대중’으로 가정"],
  "score": 8,
  "questions": [],
  "sources": [ { "text": "역할을 부여하면…", "metadata": {"technique": "Role Prompting"}, "score": 0.63 } ]
}
```

---

## 4. 에러 계약

| HTTP | 언제 | 프론트 처리 |
|---|---|---|
| `404` | **첫 턴**(history 없음)에 입력과 관련된 개선 기법을 못 찾음(무관 입력) | "관련 기법을 찾지 못했어요" 안내. `detail`에 메시지 |
| `503` | LLM 생성 실패·빈 응답·호출 한도(429 소진) 등 | "잠시 후 다시" 재시도 안내. `detail`에 사유 |
| `422` | 요청 스키마 위반(예: `query` 누락) | 입력 검증 오류 — 개발 단계에서만 발생 |

- 404는 **기법 기준** 판정이다(예시는 무관 입력을 구제하지 않음). 후속 피드백 턴
  (history 있음)은 검색이 약해도 대화 맥락으로 이어가므로 404가 나지 않는다.
- 에러 응답 본문: `{"detail": "…메시지…"}` (FastAPI 표준).

---

## 5. 왕복 흐름 (질문 모드 → 개선안)

```
① POST /query { query:"좋은 글 써줘" }
      → 200 { mode:"ask", questions:["어떤 주제?","독자는?","분량은?"], summary:… }

② 프론트: questions 를 방식1 리스트로 렌더 → 사용자 답변 수집 (렌더 상세: CONTRACT_FRONTEND.md)
      예) "여행 후기 / 20대 / 3문단"

③ POST /query {
        query: "여행 후기, 독자는 20대, 3문단 정도로",   ← 사용자 답변을 query 로
        history: [
          {role:"user",      content:"좋은 글 써줘"},
          {role:"assistant", content:"<①의 answer 마크다운 그대로>"}
        ]
      }
      → 200 { mode:"improve", improved_prompt:"너는 …다. …작성하라.", score, changes… }

④ 프론트: improved_prompt 표시 + Execute 활성
```

- 한 라운드로 부족하면 ②~③이 **다시 `mode:"ask"`**로 올 수 있다(최대 2~3라운드). 프론트는
  `mode`만 보고 매 턴 동일하게 분기하면 된다.
- **같은 질문 반복 방지**는 RAG가 history를 보고 처리한다 — 프론트는 history를 빠짐없이 넘기기만.

---

## 6. 역할별 가이드 (파일 분리)

이 문서는 **AI 담당자가 정의하는 `/query` 공통 계약**이다.

> 🧭 **계층 간(rag↔backend↔frontend) 통합 규칙의 단일 진실 소스는 [`CONTRACT_LAYERS.md`](CONTRACT_LAYERS.md)**.
> backend·프론트 담당자에게 공유할 문서는 그것. 아래는 역할별 상세 가이드.

백엔드·프론트 담당자의 구체 작업은 각자 파일로 분리했다:

- **백엔드** → [`CONTRACT_BACKEND.md`](CONTRACT_BACKEND.md) — `/api/prompts/improve` 설계,
  로그인·DB·`/query` 호출·응답 매핑(snake→camel)·에러 매핑
- **프론트** → [`CONTRACT_FRONTEND.md`](CONTRACT_FRONTEND.md) — `mode` 분기, 방식1(리스트)
  렌더, 질문 표시, 왕복 흐름, Execute 조건
- **결정 필요 사항(코드 근거)** → [`CONTRACT_DECISIONS.md`](CONTRACT_DECISIONS.md) — 실제 구현을
  읽고 도출한 미해결 결정·결함. **⚠️ 현재 백엔드·프론트가 `mode`/`questions`를 안 읽어 질문 모드가
  end-to-end로 깨져 있음** — 여길 먼저 볼 것.

**핵심 합의 요약**
- 백엔드는 `mode`·`summary`·`questions`·`improved_prompt` 등을 프론트로 **그대로 통과**시킨다
  (`answer`만 내려주면 프론트가 마크다운 되파싱 필요 → 지양).
- 프론트 UI는 **방식1(리스트) 채택 · 방식2/3 보류(2026-07-23)**. 변경 전 계약으로도 방식1은
  동작했고, 되파싱이 필요했던 건 방식2/3뿐이라 안 만들면 문제 없음. `questions[]`가 `항목명:`
  접두로 구조화돼 있어 보류 해제 시 **추가 API 변경 없이** 카드/배너로 확장 가능.

---

## 7. 참고

- 응답 조립 로직: `app/rag/postprocess.py:assemble_fields()` (LLM 없이 단위 테스트 —
  `tests/test_postprocess.py`). 스키마 정의: `app/main.py:QueryResponse`.
- 파이프라인 전체: [`RAG_PIPELINE.md`](RAG_PIPELINE.md). 변경 이력: [`WORKLOG.md`](WORKLOG.md).
