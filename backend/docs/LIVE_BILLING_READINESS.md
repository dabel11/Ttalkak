# 실결제 전환 준비 및 출시 기준

상태: 실결제 비활성 / 출시 보류 (2026-10-12 KST)
기준 코드: PR #56 병합 커밋 `21bf03ed111d5d3cd8d5da0db6bf2959d9c149b9`.
이 문서는 실제 판매 조건을 확정하거나 라이브 결제를 활성화하지 않는다.

## 확인된 운영 상태

- Railway: ttalkak-staging / production / backend.
- PR #56 병합 후 backend, web, rag-server 배포 성공.
- billing_subscriptions, billing_charges, paid_usage_periods 존재.
- 신규 컬럼 7개 생성 완료: 세 테이블의 plan_code VARCHAR(16),
  billing_charges.amount_krw INT, charge_kind VARCHAR(16),
  upgrade_request_limit BIGINT, paid_usage_periods.request_limit_override BIGINT.
  모두 NULL 허용. 수동 마이그레이션은 실행하지 않았다.
- MEMBER_REQUEST_QUOTA_ENABLED=true.
  FREE_REQUEST_LIMIT=10, LIGHT_REQUEST_LIMIT=30,
  STANDARD_REQUEST_LIMIT=70, PRO_REQUEST_LIMIT=150.
- FREE는 한국시간 월 단위, 유료는 결제 기간 단위.
  기존 기간 사용량을 포함하므로 활성화 시 이미 한도에 도달한 회원은 새 요청이 차단된다.
- 사용자 진술로 외부 백업 완료를 전달받았다. Railway Backups 화면에는 No Backups가 표시됐으며,
  외부 백업의 복구 테스트나 내용은 이번 작업에서 확인하지 않았다.
- 실제 결제사 승인, 실결제, 취소/환불 검증은 수행하지 않았다.

## 현재 코드에서 확인한 출시 차단 항목

1. BillingService.configured(), chargeDue(), TossBillingGateway.authorization()은
   테스트 키만 허용한다. 환경변수만 라이브 키로 바꾸면 실결제가 동작하지 않는다.
2. POST /api/me/billing/cancel은 자동 갱신 중단이다.
   결제 취소/환불 API, 취소 대사, 환불에 따른 사용 권한 조정은 구현돼 있지 않다.
3. BillingSubscription, BillingCharge, PaidUsagePeriod에 결제 환경/상점 구분이 없다.
   현재 DB의 테스트 billingKey, 주문, 유료 권한이 라이브 환경으로 섞이지 않도록 전환 설계가 필요하다.
   테스트/라이브는 별도 DB 또는 명시적인 환경 구분과 스케줄러 필터로 분리한다.
   기존 데이터 삭제나 라이브 전환을 자동으로 수행하지 않는다.
4. TossBillingGateway.charge()의 orderName이 모든 등급에 대해
   "TTalkak PRO monthly"로 고정돼 있다. 등급과 정기결제/업그레이드 종류에 맞는 표시가 필요하다.
5. 4xx(408/429 제외)를 승인 거절로 일괄 분류한다.
   인증·설정 오류와 카드 승인 거절을 구분하고, 결제사 오류 코드 계약에 따른 회귀 테스트가 필요하다.
6. 최초 카드 등록 통신 결과가 불확실하고 DB에 billingKey가 없으면
   현재 주문 재조회만으로 복구할 수 없다. 결제사 계약에 맞는 복구 절차가 필요하다.

## 구현 전에 필요한 사업자 확인

- 자동결제 사용 계약/승인 여부와 대상 라이브 상점.
- 판매 주체, 고객 문의 연락처, 결제 및 자동 갱신 동의 화면.
- 가격 및 세금 표시, 구독 해지 효력, 환불 정책과 운영 담당자.
- 라이브 키는 채팅·GitHub·로그에 기록하지 않고 Railway 비밀 변수에 직접 등록한다.
- 테스트 데이터 분리 방안과 복구 가능한 백업 위치를 운영 담당자가 확인한다.
- 계약/정책 미확정 항목은 임의의 문구나 요율로 확정하지 않는다.

## 구현 및 검증 순서

1. 결제 환경을 명시하고 기본값을 disabled 또는 test로 유지한다.
   client/secret 키 환경 불일치, 미승인 live 모드, 스케줄러 환경 혼합을 차단한다.
2. 등급별 결제 표시, 오류 분류, 최초 등록 복구를 보완한다.
3. 결제 취소/환불을 원 주문에 연결하고, 재시도 멱등성·불확실 결과 대사·사용 권한 반영을 구현한다.
   고객 환불 요청과 관리자 처리를 구분하고 개인정보/키를 로그에 남기지 않는다.
4. 테스트 환경에서 첫 결제·자동 갱신·업그레이드·거절·timeout·중복 요청·해지·환불을 검증한다.
5. PG 계약, 고객 안내, 운영 대응과 복구 준비가 확인되면 라이브 배포 후보를 검토한다.
6. 실제 승인/취소 검증은 대상·금액·승인 주체를 정한 뒤 사람이 결제를 완료한다.
   자동화 에이전트가 임의의 고객 카드로 결제하거나 환불하지 않는다.
7. 검증 완료 후 공개 결제 화면을 열고 실패율·미확정 주문·환불 결과를 관찰한다.

## 공개 서비스의 한도 안내

실결제 비활성 상태에서 FREE 10회 제한은 적용 중이다.
한도 소진 시 다음 초기화까지 기다려야 한다는 안내가 필요하며,
구매할 수 없는 유료 상품으로의 업그레이드를 해결책으로 약속하지 않는다.
실결제 준비가 장기화되면 PM이 임시 한도 완화 여부를 결정한다.
