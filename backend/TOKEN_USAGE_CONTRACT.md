# 회원 토큰 사용량 저장 계약 (1단계)

`MemberTokenUsageService`는 회원의 AI 사용량을 요청당 한 행으로 저장한다. 비로그인 Guest 3회 제한과 별개이다. 이번 단계에는 DB 기록·중복 방지·기간 합산만 포함한다. AI 연결, 한도 차단, 결제 및 화면용 API는 아직 연결하지 않는다.

## AI `/query` 성공 응답에서 필요한 값

```json
"usage": {
  "inputTokens": 100,
  "outputTokens": 20,
  "totalTokens": 120
}
```

- 값은 토큰 추정치가 아닌 LLM 제공자의 usage이다. 분석·생성 등 한 요청에 사용한 **모든 LLM 호출**의 수치를 합산한다. 검색 임베딩 등 별도 과금 항목이 있다면 AI 담당자와 포함 여부를 합의해야 한다.
- `totalTokens`는 `inputTokens + outputTokens` 이상인 음수가 아닌 정수이다. 제공자의 별도 추론 토큰이 포함될 수 있다.
- RAG 서버가 사용량을 제공하기 전에는 백엔드에서 0이나 글자 수 추정치를 기록하지 않는다. 이후 연동 시 누락된 usage는 정상 사용량으로 간주하지 않고 별도 오류로 처리한다.

## 백엔드 기록 규칙

- `(memberId, requestKey)`는 유일하다. 동일한 요청이 재전송되면 한 번만 기록한다. 같은 키에 다른 토큰 값이 들어오면 `TOKEN_USAGE_REQUEST_CONFLICT` (409)를 반환한다.
- `requestKey`는 백엔드가 AI 호출마다 정하는 안정적인 키다. 기존 `requestId`를 사용하거나 요청에 없다면 새 UUID를 생성할 수 있다. 대화 재생(idempotent replay)은 AI를 재호출하지 않으므로 토큰을 추가로 기록하지 않는다.
- `sumKstMonth`는 서울 시간의 달력 월 `[1일 00:00, 다음 달 1일 00:00)`을 합산한다. `sum(start, end)`는 결제 주기에 맞춘 PRO 기간에도 쓸 수 있다.
- 추후 `/api/prompts/improve` 연동 시 성공한 AI 응답의 usage와 대화 저장 상태를 함께 고려해 기록 위치를 정해야 한다. 이 저장 계층만으로는 요금제 한도를 강제하지 않는다.
