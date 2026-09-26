# Guest 3회 제한 연동 계약

Backend의 `POST /api/prompts/improve`는 비로그인 요청에서 `X-Session-UUID` 헤더를 요구한다. 로그인 요청에는 이 헤더가 필요하지 않다. UUID 값은 클라이언트 설치/브라우저 저장소에서 생성해 계속 재사용한다. Chrome Extension의 기존 `session-...` 형식도 허용한다. Web과 Extension 저장소가 다르면 서로 다른 Guest로 계산된다.

Backend는 Guest 식별자를 SHA-256 해시로 DB에 보관하고, 성공한 개선 요청을 3회까지 허용한다. 4번째 요청은 AI 서버를 호출하기 전에 차단한다. 실패한 AI 호출은 횟수에 반영하지 않는다.

| 상황 | HTTP | `code` |
|---|---:|---|
| 비로그인 헤더 누락/빈 값 | 400 | `SESSION_UUID_REQUIRED` |
| 헤더 형식 오류 | 400 | `SESSION_UUID_INVALID` |
| 3회 소진 | 429 | `FREE_TRIAL_LIMIT_EXCEEDED` |

오류 응답은 기존 `ApiErrorResponse` 형식이다. 예:

```json
{
  "timestamp": "2026-09-26T18:00:00+09:00",
  "status": 429,
  "error": "Too Many Requests",
  "code": "FREE_TRIAL_LIMIT_EXCEEDED",
  "message": "무료 체험 횟수를 모두 사용했습니다.",
  "path": "/api/prompts/improve"
}
```

## 백엔드 변경과 독립적으로 시작할 수 있는 작업

- Web 담당: Guest UUID 생성/저장, 비로그인 개선 요청에 `X-Session-UUID` 전송, 기존 `guestImproveCount`의 로컬 차단 제거, 위 429 코드의 로그인/회원가입 안내. API가 준비되기 전까지 요청 헤더와 오류 처리에 대한 프론트 단위 테스트를 작성할 수 있다.
- Extension 담당: 기존 `sessionUuid` 생성·저장·헤더 전송을 유지하고, 429의 `code`를 읽어 로그인/회원가입 안내를 표시한다. 헤더 생성 및 오류 UI 테스트는 Backend 완료 전에 진행할 수 있다.
- AI 담당: `/query` 성공 응답에 실제 LLM 제공자 usage의 `inputTokens`, `outputTokens`, `totalTokens`를 합산해 전달할 계약을 Backend와 확정한다. 모델별 usage 필드 확인과 복수 LLM 호출 합산 구현은 Guest 제한과 독립적으로 진행할 수 있다. AI는 Guest/FREE/PRO 및 결제 상태를 판정하지 않는다.

회원 토큰 한도 UI와 자동 결제 UI는 각 Backend API 계약이 정해진 뒤 연동한다. Guest 3회 제한은 회원 토큰 집계와 별도로 먼저 검증한다.
