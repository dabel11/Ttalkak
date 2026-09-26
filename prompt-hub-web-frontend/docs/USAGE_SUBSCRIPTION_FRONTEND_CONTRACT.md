# 사용량 및 구독 프런트엔드 계약

Web과 Chrome Extension은 `shared/usage-entitlement.mjs`의 같은 정규화 규칙을 사용합니다. Backend가 아래 응답과 오류 코드를 제공하면 두 클라이언트가 별도 배포 없이 같은 정책으로 표시합니다.

## 첨삭 요청

- 비로그인 요청은 `Authorization` 대신 `X-Session-UUID`를 전송합니다.
- 로그인 요청은 `Authorization: Bearer <token>`을 전송합니다.
- UUID나 토큰은 요청 본문에 포함하지 않습니다.
- 사용량의 최종 판정은 Backend가 담당합니다.

첨삭 성공 응답에는 다음 `usage` 또는 `entitlement` 객체를 포함할 수 있습니다.

```json
{
  "usage": {
    "plan": "FREE",
    "status": "ACTIVE",
    "dailyLimit": 10,
    "usedToday": 7,
    "remainingToday": 3,
    "resetAt": "2026-09-25T00:00:00+09:00",
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false
  }
}
```

## 구독 API

| Method | Path | Frontend use |
| --- | --- | --- |
| `GET` | `/api/subscriptions/me` | 현재 플랜, 사용량, 취소 예정 상태 조회 |
| `POST` | `/api/subscriptions/checkout` | PRO 결제 페이지 URL 발급. 본문은 `{ "plan": "PRO" }` |
| `POST` | `/api/subscriptions/portal` | 결제 관리 페이지 URL 발급 |

Checkout 응답은 `checkoutUrl`, Portal 응답은 `portalUrl`을 반환합니다. `data` 안에 넣는 형태도 허용합니다. URL은 HTTPS여야 합니다.

## 제한 오류

| Code | Client action |
| --- | --- |
| `FREE_TRIAL_LIMIT_EXCEEDED` | 로그인 화면 열기 |
| `DAILY_USAGE_LIMIT_EXCEEDED` | FREE는 요금제 페이지 안내, PRO는 초기화 시각 안내 |
| `SUBSCRIPTION_PAST_DUE` | 결제 관리 안내 |
| `PAYMENT_VERIFICATION_FAILED` | PRO 활성화 금지 및 결제 확인 안내 |

제한 오류 응답에도 최신 `usage` 또는 `entitlement`를 포함하면 UI가 즉시 잔여량을 갱신합니다. 구독 API가 아직 배포되지 않은 환경의 `404`와 `501`은 첨삭 기능을 막지 않습니다.

## Backend 운영 경계

- 사용량 기본값은 Guest 총 3회, FREE 하루 10회, PRO 하루 100회이며 각각 `GUEST_USAGE_LIMIT`, `FREE_DAILY_USAGE_LIMIT`, `PRO_DAILY_USAGE_LIMIT`로 조정할 수 있습니다.
- 일일 사용량 초기화 기준은 `USAGE_TIME_ZONE`이며 기본값은 `Asia/Seoul`입니다.
- 동시 요청은 사용 가능 횟수를 먼저 예약하되, AI/RAG 오류나 응답 저장 실패가 발생하면 예약을 반환해 실제 사용량을 증가시키지 않습니다.
- 결제 공급자가 설정되지 않은 환경에서 Checkout과 Portal API는 `501 / BILLING_PROVIDER_NOT_CONFIGURED`를 반환합니다.
- 실제 결제 공급자 연동은 Backend의 `BillingGateway` 구현으로 제공하고, Checkout·Portal 주소는 HTTPS만 허용합니다.
