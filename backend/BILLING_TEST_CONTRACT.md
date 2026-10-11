# 토스페이먼츠 테스트 자동결제 계약

이 기능은 **토스페이먼츠 테스트 키만 허용**한다. 라이브 키로는 동작하지 않는다. 카드 번호와 시크릿 키는 프론트엔드와 저장소에 두지 않는다. 실거래를 열려면 별도 계약, 보안 검토, 취소·환불·대사 정책이 필요하다.

## 환경변수

`backend/.env`에 테스트용 `TOSS_TEST_CLIENT_KEY=test_ck_...`, `TOSS_TEST_SECRET_KEY=test_sk_...`를 설정한다. 같은 상점의 한 쌍을 사용한다. 현재 테스트 PRO 기본 금액은 `PRO_MONTHLY_PRICE_KRW=9900`이며, LIGHT 3,900원 / STANDARD 5,900원 / PRO 9,900원 모두 테스트 결제에서 선택할 수 있다. 실제 운영 판매 승인은 아직 완료되지 않았다. 이전 환경변수 4,900원이 남아 있으면 결제 금액 불일치를 방지하기 위해 테스트 결제를 차단한다. 최종 요금 결정 후 환경변수와 코드 기본값을 함께 검토한다. 키가 없으면 결제 요청은 503이고 자동 갱신은 실행되지 않는다. Docker Compose 백엔드도 `backend/.env`를 읽는다.

요금제 비교는 공개 `/pricing` 페이지, 구독 관리와 사용량 안내는 마이페이지에서 제공하며 기존 토스 결제 모달을 재사용한다. 페이지 조회는 사용량·결제 상태 GET만 실행하며 카드 등록·결제 세션 생성은 사용자가 결제를 선택한 뒤에 수행한다. 원클릭 개선과 Make는 같은 회원 토큰 한도를 사용한다. 현재 개발 브랜치의 4단계 제안은 FREE 10회 / LIGHT 30회 / STANDARD 70회 / PRO 150회이다. 월 제공 횟수 차단은 기본 비활성화되어 있으며 별도 승인이 필요하다. 실제 토큰 한도와 차단 활성화는 AI 요청 비용 검증 후 별도 결정한다.

배포 환경에 `PRO_MONTHLY_PRICE_KRW`가 이미 설정되어 있다면 코드 기본값 변경만으로는 금액이 바뀌지 않는다. 요금 확정 후 출시 전에 환경변수와 실제 `/api/me/billing/setup` 응답 금액이 승인된 판매 가격과 일치하는지 확인한다. 이 브랜치 작업은 운영 환경변수 변경·실결제·배포를 포함하지 않는다.

## 다단계 테스트 구독 및 즉시 업그레이드 API

- `POST /api/me/billing/setup`: 선택 항목 `{"plan":"LIGHT"|"STANDARD"|"PRO"}`. 본문을 생략한 기존 호출은 기존 선택 상태를 유지하며 신규 계정은 PRO를 기본 선택한다. 응답 `{clientKey,customerKey,amount,cardRegistered,plan}`. 가격은 서버가 결정하며 프론트가 임의로 입력할 수 없다.
- `GET /api/me/billing`: 기존 상태 + `plan`. 실제 사용 권한은 `GET /api/me/usage`의 `plan` 확인. 첫 결제가 완료되지 않았으면 선택 상품과 실제 권한이 다를 수 있다.
- `GET /api/me/billing/upgrade-quote?plan=STANDARD`: 현재 활성 유료 가입자의 상위 요금제에 대한 `{fromPlan,targetPlan,amount,nextMonthlyAmount,requestLimitAfterUpgrade,periodEnd}`. 남은 기간 비례 **즉시 차액**을 서버가 원 단위 올림해 계산한다.
- `POST /api/me/billing/upgrade`: `{"plan":"STANDARD","expectedAmount":1000}`처럼 사용자가 확인한 금액으로 명시적으로 결제 승인. 금액이 변경되었으면 409로 차단하고 견적 재조회. `amount`는 예시이고 항상 견적 응답 금액을 사용한다.
- 업그레이드 도중 통신 결과가 불확실하면 새로운 주문을 발행하지 않고 **동일한 저장된 주문번호와 금액으로 재확인**한다. 명확한 카드 승인 거절은 기존 등급을 유지한다.
- 회원별 이전 사용량과 결제 기간은 보존하고, 남은 기간만큼 추가 요청 가능 횟수를 제공한다. 다음 자동 갱신은 새 등급의 전체 정가를 기준으로 처리한다.
- 결제 테스트 키 이외 라이브 키는 거부한다. 운영 DB 신규 컬럼, 결제 대사·취소/환불 정책, 가격 확정, 보안 점검과 스테이징 통합 검증이 완료되기 전에는 실거래 전환 금지.

## 프론트 흐름

모든 경로는 로그인한 회원의 `Authorization: Bearer <accessToken>`이 필요하다.

1. `POST /api/me/billing/setup` → `{clientKey, customerKey, amount, cardRegistered}`. `customerKey`는 서버가 생성하며 회원 ID를 노출하지 않는다.
2. `cardRegistered=false`면 토스페이먼츠 SDK v2로 `TossPayments(clientKey).payment({customerKey}).requestBillingAuth({method:"CARD",successUrl:"https://.../billing/success",failUrl:"https://.../billing/fail"})`를 호출한다. 카드 정보는 SDK 결제창에서 입력한다. `successUrl`과 `failUrl`은 실제 프론트 주소를 넣는다.
3. 성공 URL의 `authKey`, `customerKey`를 읽어 `POST /api/me/billing/complete` 본문 `{ "authKey":"...", "customerKey":"..." }`으로 보낸다. 서버가 해당 회원의 customerKey를 검사하고, 빌링키 발급 API와 첫 테스트 결제(설정된 금액) 승인 API를 호출한다. 결제 성공(`DONE`, `BILLING`, 주문번호·금액 일치)일 때만 PRO 기간을 저장한다. authKey는 URL에 남겨두지 말고 처리 뒤 지운다.
4. `GET /api/me/billing` → `{cardRegistered,autoRenew,nextChargeAt}`. `GET /api/me/usage` → 현재 FREE/PRO 기간과 사용량. 카드 등록 성공과 결제 성공은 별개다.
5. `POST /api/me/billing/cancel`은 다음 자동 갱신만 끈다. 현재 결제된 기간은 만료일까지 유지된다. `POST /api/me/billing/retry`는 기존 등록 카드로 결제를 재시도하거나 취소한 갱신을 재개한다.

매 분 결제일이 지난 구독을 확인하고, 결제가 성공한 경우에만 결제 시점부터 서울 시간 기준 한 달 PRO 기간을 추가한다. 명확한 카드 승인 실패는 자동 갱신을 중단한다. 응답 불명확/서버 재시작 시 기존 주문번호를 조회하고 동일 멱등키로 다시 시도한다. 실제 월 갱신을 빠르게 보여주려면 테스트 DB/시계에서 다음 결제일을 앞당겨 별도 시연 환경에서 확인한다. 운영 계정 결제일을 임의 수정하는 공개 API는 제공하지 않는다.

테스트 환경에서도 결제사 장애 시 승인 상태를 확정할 수 없을 수 있다. `BILLING_UNCERTAIN`이 반복되면 토스페이먼츠 테스트 결제내역과 `billing_charges.order_id`를 대조한다. 실거래용 기능은 아니다.

공식 문서: https://docs.tosspayments.com/guides/v2/billing/integration · https://docs.tosspayments.com/reference · https://docs.tosspayments.com/reference/using-api/authorization
