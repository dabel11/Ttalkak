# TTALKAK 계정 탈퇴 데이터 보존·삭제 결정 대장

> 2026-10-19 코드 기반 기술 점검(2026-10-29 GitHub 병합 상태 재확인). **개인정보처리방침·법률 검토 확정본이 아님.**
> 원작업 브랜치: `hardening/backend-graduation-batch`; [PR #69](https://github.com/dabel11/Ttalkak/pull/69)은 2026-10-21 12:32 UTC에 `develop`으로 **병합**됨([커밋 `524ce95`](https://github.com/dabel11/Ttalkak/commit/524ce9532ff18a52be5d4d31ae869761aac20df6)).
> 1~2절의 "변경 후"는 **PR #69의 병합된 코드 기준**이다. 6절의 추가 테스트·카드 등록·재시도 보호는 **PR #83의 변경**이며, #69의 병합 사실을 #83의 병합·배포 근거로 사용하지 않는다. 실제 Railway 배포 버전·운영 데이터 상태는 CI로 증명되지 않으며, 기존 탈퇴 계정의 DB를 자동 소급 정리하지 않는다.

## 1. 코드에서 확인한 기존 동작

`AccountWithdrawalService.withdraw()`, `Member.withdraw()`을 기준으로 다음이 확인된다.

| 데이터 | 기존 탈퇴 처리 | PR #69 병합 코드 또는 미결 과제 |
| --- | --- | --- |
| 로그인 상태 | `members.active=false`, `withdrawnAt` 기록; 인증은 활성 회원만 허용 | 유지. JWT/재로그인 차단 회귀 검증 |
| 이메일·전화·생년월일 | 회원 테이블에서 null 처리 | 유지 |
| 이름·닉네임 | 회원 이름은 "탈퇴한 사용자", 내부 닉네임은 `withdrawn_user_<id>` | 유지 |
| 로그인 아이디·비밀번호 해시 | `userId` 원문은 예약 유지, password 해시도 남음 | **잔존 확인**, 폐기/별도 tombstone 정책은 미확정 |
| Google 고유 식별자 | `provider_subject` 유지, 탈퇴 Google 계정 재로그인 차단에 이용 | **잔존 확인**, 개인정보 최소화와 재가입 방지 정책 충돌 — 별도 결정 필요 |
| 공개·비공개 프롬프트 | 게시글 **작성자 표시 닉네임만** 익명화, 원문·authorId·공개 상태는 유지 | 게시글 원문·개인 정보 포함 가능. 공개 기여물의 저작권/보존 및 비공개 초안 삭제 정책 필요 |
| 댓글 | 작성자 표시 닉네임만 익명화, 원문·authorId 유지 | 탈퇴 사용자 댓글의 보존·가림/삭제 정책 필요 |
| Make 서버 대화·폴더 | **기존에는 탈퇴해도 남음** | **PR #69에서 같은 트랜잭션 내 사용자 소유 서버 대화·폴더 삭제 추가**. 기존 탈퇴 회원의 과거 잔존 데이터는 별도 승인·소급 조치 필요 |
| 프롬프트 저장·좋아요 | 회원 연결 레코드 잔존, 개수 집계도 별도 정리 없음 | 보존 필요/삭제 및 집계 보정 정책 미확정 |
| 신고·관리자 감사 로그 | 신고 사유·상태·회원 연결과 감사 정보가 남을 수 있음 | 분쟁 대응·안전 감사 용도와 필요 기간 확정 전 임의 삭제 금지 |
| 사용량·요청 추적 | 회원별 요청/AI 토큰·이용권·request lease 기록 잔존 | 과금 대사·남용 대응 목적별 최소 범위 및 보존 기한 결정 필요 |
| 구독·결제·환불 기록 | 구독/주문/결제수단 키 연관 행이 유지될 수 있음; **기존 탈퇴 경로에는 자동갱신 중지 없음** | **PR #69에서 탈퇴 트랜잭션 내 향후 자동갱신 중지**. 이미 진행 중인 결제/취소·환불은 별도 대사 필요. 결제 키 폐기 및 거래기록 보존은 계약·법적 의무 확인 후 설계 |
| 외부 공급자·백업·브라우저 | 서버 탈퇴 메서드만으로 Google/Resend/Toss 외부 데이터, 과거 DB 백업 및 브라우저/확장 로컬 기록까지 제거되지 않음 | 범위·책임자·삭제/만료·안내문 일치 여부 별도 점검 |

**익명화 표시 이름은 완전한 개인정보 삭제가 아니다.** 회원 ID, 기존 내용, 계정 연결 기록으로 재식별될 가능성이 있다. 코드 수준 조치와 법적·서비스 정책을 구분한다.

## 2. `develop`에 병합된 기술적 보호 (운영 배포 미확인)

- 탈퇴가 인증 실패로 거부되면 데이터 삭제·구독 변경을 실행하지 않음.
- 탈퇴 성공 시 소유 Make 서버 대화/폴더를 같은 DB 트랜잭션에서 정리. 계정 활성 상태 변경과 함께 롤백 가능하도록 `@Transactional`을 유지.
- 구독이 있을 때 `autoRenew=false`로 변경하여 미래 갱신을 중단. 기존 주문·구독·환불 기록은 유지.
- **스케줄러 이중 방어 추가:** 자동 청구 후보 조회에서 `members.active=true`를 요구하고, 조회 시점 이후 탈퇴한 계정을 대비해 청구 준비 단계에서도 활성 회원을 재검증한다. 과거 구독 레코드가 `autoRenew=true`로 남아 있어도 새 자동 청구 대상에서 제외한다.
- **한계:** 결제사 호출이 **이미 시작된 다음** 탈퇴가 진행된 경우 실제 승인 여부를 로컬에서 취소할 수 없다. 기존 주문/결제 기록을 보존해 재조회·대사하며, 고객 안내·환불 결정을 별도 진행해야 한다.
- Spring/H2 통합 테스트에서 대화/폴더 삭제, 세션 재사용 차단, 구독 자동갱신 중지를 확인. 이 탈퇴 통합 테스트는 결제사 네트워크 요청 없이 `BILLING_MODE=disabled`로 실행하며, 6절의 `BILLING_MODE=test` 모의 공급자 테스트와 구분한다.
- **주의**: 이미 결제 승인 요청이 공급자로 나간 경우, 로컬 자동갱신 중지만으로 청구를 되돌릴 수 없음. 주문 대사 및 고객 안내·환불 절차가 별도로 필요.

## 3. 사업화 전 반드시 확정할 정책 (소유자/팀 협의)

1. 데이터 종류별 수집 목적, 필수/선택 여부, 서비스 제공 종료 후 보존 근거 및 기간, 파기 시점.
2. 공개한 커뮤니티 게시글·댓글과 비공개 개인 대화의 차이, 탈퇴 시 이용자 선택권·공동 개발 결과물 권리.
3. 회원 `userId` 예약 정책, Google 식별자 및 비밀번호 해시 보존 필요성 — 불가피한 경우 분리된 보관/접근 제어.
4. 저장·좋아요·신고·사용량·결제 기록과 관리자 감사 로그의 보존/열람 권한. 개인을 식별하는 내용이 실제로 남는지 점검.
5. 결제사 계정·billing key 해지, 진행 중 구독·환불·청구 대사, 고객 안내 및 장애 대응 책임.
6. 백업·복원본·외부 로그·클라이언트 캐시의 파기 주기와 접근 통제, 개인정보 문의·삭제 요청 처리 절차.

**임의로 보존 기한이나 법률상 의무 기간을 기입하지 않는다.** 한국 개인정보 관련 법률 및 실제 계약 조건·서비스 정책을 적절한 전문가와 확인한 후 공개 약관·처리방침과 코드가 일치하도록 변경한다.

## 4. 기존 탈퇴 계정의 잔존 데이터 조사 (운영 DB 미실행)

`backend/db/manual/withdrawal-retention-inventory.sql`은 **집계 건수만** 반환하는 읽기 전용 점검 SQL이다. 제한된 DB 계정으로 테이블/컬럼 구성을 먼저 확인한 뒤, 승인된 환경에서만 실행한다.

중점: 탈퇴 회원의 Make 서버 대화·폴더, 자동갱신 활성 구독, 결제 수단 키 존재 건수. 결제 승인 결과를 확정하지 못한 `PENDING` 주문의 건수도 별도로 확인한다. 실제 데이터 행·메시지·사용자 ID·키를 이슈/PR/공유 로그에 복사하지 않는다.

- 기존 탈퇴 회원의 Make 대화가 남더라도 **운영 DB에서 바로 DELETE하지 않는다.** 필요한 보존 의무·백업·참조 관계 및 접근 권한 점검 후 별도 승인된 소급 삭제 계획을 만든다.
- 자동갱신이 켜진 비활성 회원이 있다면 결제 중복/진행 중 청구 여부를 확인하고 우선 대응한다.
- CI 복원 리허설은 MySQL 8.4 폐기 가능한 데이터 대상이며 실제 Railway MySQL 9의 복구 보장을 의미하지 않는다.

## 5. 집계 결과 검증 및 대응 절차 (폐기 가능한 CI 환경)

기존 `backend/db/manual/withdrawal-retention-inventory.sql`은 실제 운영 DB에서는 **별도로 승인된 읽기 전용 계정**으로만 실행한다. 새 CI 절차에서는 다음과 같이 외부 연결 없는 폐기 가능한 `ttalkak-ci` MySQL에서 먼저 검증한다.

```bash
python3 scripts/test-withdrawal-inventory-output.py
# CI workflow가 disposable MySQL 기동/통합 테스트 이후 실행:
# TTALKAK_CI_WITHDRAWAL_AUDIT=1 bash scripts/check-disposable-withdrawal-inventory.sh
```

`scripts/check-disposable-withdrawal-inventory.sh`는 GitHub Actions 환경과 명시적인 CI 전용 플래그가 없으면 실행을 거부한다. SQL은 읽기 전용 트랜잭션에서 실행하며, 결과는 `scripts/check-withdrawal-inventory-output.py`가 미리 정해진 항목명과 **0 이상의 정수 건수**만 수락한다. 사용자 ID, 이메일, 주문 ID, 개인 대화 본문 및 결제 키가 결과에 포함되면 실패하고 값을 출력하지 않는다.

`PASS`는 **검사된 위험 집계 항목이 0건**이라는 뜻이지, 전체 개인정보 파기가 완료되었다는 뜻이 아니다. 다음 중 하나라도 발견되면 `REVIEW_REQUIRED`로 처리한다.

| 검토 항목 | 대응 담당자가 확인할 사항 | 자동 조치 |
| --- | --- | --- |
| 탈퇴 회원 Make 대화·폴더 잔존 | 과거 버전에서 생성된 행인지, 보존 의무·복구 백업·FK 영향 확인 | 삭제 금지 |
| 탈퇴 회원 구독 자동갱신 켜짐 | 결제사 상태·이미 처리 중인 청구·스케줄러 상태 확인 후 갱신 차단 승인 | 변경 금지 |
| 탈퇴 회원에 연결된 결제수단 billing key 잔존 | 계약상/환불상 보존 필요성과 안전한 폐기·공급자 연동 확인 | 키 공개·폐기 금지 |
| 탈퇴 회원 미확정 PENDING 청구 | 기존 주문 ID로 결제사 상태 **조회**·대사. 조회에 사용한 ID는 권한 통제된 운영 시스템에만 기록 | 새 청구·자동 환불 금지 |

운영 DB에서 인가된 조사를 실행하더라도 GitHub Actions/PR/일반 이슈에는 **집계 건수 및 재현 가능한 비민감 오류 코드만** 공유한다. 결제 상태 조회·갱신 차단·삭제·환불은 거래 중복 방지 및 오프사이트 백업/격리 복구 가능성을 확인하고 승인된 운영 절차로 분리한다.

## 6. 탈퇴·결제 동시성 경계 검토 및 모의 회귀 검증 (2026-11-03 DB·근거 정정)

`BillingService.charge()`의 **청구 준비 단계**는 `lockActiveByMemberId()`로 활성 회원 여부를 확인하고, `AccountWithdrawalService.withdraw()`는 구독을 잠가 `autoRenew=false`로 변경한다. 그러나 청구 준비 트랜잭션이 종료된 후 실제 공급자 호출은 DB 잠금 밖에서 수행된다. 따라서 **준비 이후 탈퇴가 완료되었더라도** 이미 준비된 주문의 공급자 청구 요청이 시작되거나 결과가 뒤늦게 도착할 수 있다. 이는 운영에서 실제 발생했다고 확인한 사례가 아니라 **코드상의 가능한 경합**이다.

| 경합 순서 | 코드상 예상 동작 | 별도 검증 / 대응 |
| --- | --- | --- |
| 탈퇴 트랜잭션 완료 → 청구 준비 | 활성 회원 필터가 신규 청구 준비를 거부해야 함 | 기존 `BillingServiceIntegrationTest`의 비활성 회원·stale 후보 검증 근거를 유지 |
| 청구 후보 조회 → 탈퇴 완료 → 청구 준비 | 최종 활성 회원 재검사로 신규 준비를 거부해야 함 | 후보 조회와 DB 잠금 사이의 경합 회귀 유지 |
| 청구 준비·PENDING 주문 확정 → 탈퇴 완료 → 공급자 호출 | **로컬 자동갱신 해제만으로 공급자 호출을 중단한다고 보장할 수 없음** | 승인된 격리 DB + 모의 `BillingGateway`의 동기화 지점으로 재현 필요 |
| 공급자 승인 → 탈퇴 완료 → 로컬 결과 확정 | 현 코드는 구독 잠금 뒤 PENDING/DONE 및 결제 증빙을 정리하지만, 이 시점 회원 활성 상태를 다시 검사하지 않음 | 주문 ID 기반 재조회·대사, 중복 청구 방지, 환불/고객 통지 정책 필요. 임의 결제 취소 금지 |
| 탈퇴 완료 → 탈퇴 전 발급 JWT로 결제 API 재시도 | 기존 `BillingWithdrawalIntegrationTest`는 주요 결제 URL의 401을 검증함 | 비활성 사용자에게 신규 청구가 실행되지 않는지 별도 공급자 모의 테스트 필요 |

**인수 기준:** 위 경합 중 공급자 호출이 시작된 경우에는 외부 승인 결과를 DB 성공/실패만으로 단정하지 않는다. 새 주문 생성이나 무조건 재시도를 금지하고 동일 주문 ID로 조회·대사한다. 청구 경합 재현 테스트는 폐기 가능한 DB에서 `BILLING_MODE=test`·가짜 테스트 키·외부 네트워크 없는 모의 `BillingGateway`로 실행해야 한다. 기존 탈퇴 JWT 차단 테스트의 `BILLING_MODE=disabled` 설정만으로는 공급자 호출 경합을 검증할 수 없다. **실결제·운영 DB·Railway 변수 변경 없이** 검증한다. 정확한 합격 판정은 별도의 동시성 테스트와 승인된 운영 절차가 있어야 가능하다.

**추가 회귀 시험 (PR #83, 당시 검증 대상 HEAD `a82628de`):** `BillingServiceIntegrationTest`에서 `BILLING_MODE=test`, **Spring/H2 인메모리 테스트 DB(MySQL 호환 모드)**, 외부 네트워크를 사용하지 않는 **모의 `BillingGateway`**로 두 가지 결제·탈퇴 경합을 결정론적으로 재현한다. 실제 `AccountWithdrawalService.withdraw()`를 모의 공급자 호출 처리 중에 실행하므로, 청구 준비 뒤 공급자 응답이 늦게 도착하는 순서를 검증한다. **MySQL 8.4에서 실행한 시험이 아니며**, H2의 `MODE=MySQL`도 MySQL 서버·InnoDB 잠금 동작 검증을 뜻하지 않는다. 설정 근거와 다른 CI 작업의 범위는 6.2절에 구분한다.

- **지연 승인:** `withdrawalDuringInflightProviderApprovalNeverRestartsAutoRenewal()` — 회원 `active=false`, 구독 `autoRenew=false`, 기존 주문의 `DONE` 증빙 **정확히 1건**, 탈퇴 후 스케줄러 대상 제외 및 직접·스케줄러 청구 재시도 시 추가 공급자 청구 호출이 없음을 확인한다.
- **지연 거절:** `withdrawalDuringInflightProviderDeclineLeavesFailedOrderWithoutRenewal()` — `BILLING_PAYMENT_FAILED` 응답과 함께 회원 `active=false`, 구독 `autoRenew=false`, 기존 주문의 `FAILED` 증빙 **정확히 1건**, 후속 직접·스케줄러 청구 시 추가 공급자 청구 호출이 없음을 확인한다.
- 두 시나리오 모두 결제사 모의 호출은 **1회**만 기록되고 `lookup()` 재조회는 호출되지 않음을 검증한다. 이는 로컬 상태 기록과 후속 청구 억제의 회귀 근거이며, 실제 결제사 청구 취소나 대사 완료의 근거가 아니다.

**검증 실행 근거 (2026-11-01):** [PR #83 CI #642](https://github.com/dabel11/Ttalkak/actions/runs/41209711779)의 **6개 잡 모두 SUCCESS**(Backend tests 포함), [Server container smoke #369](https://github.com/dabel11/Ttalkak/actions/runs/41209711790)의 **2개 잡 모두 SUCCESS**를 확인했다. 두 실행 모두 검증 대상 커밋 `a82628de2dcb58a476972b06663ec082677a9aec`에 연결된다. 이전 HEAD `97e873c` 및 과거 CI는 이번 **승인·거절 두 시나리오** 전체의 최신 증거로 사용하지 않는다.

**추가 경계 회귀 (2026-11-01):** 같은 Spring/H2 설정의 `withdrawalDuringUncertainProviderResultPreservesPendingOrderWithoutRetry()`는 실제 탈퇴 경로가 커밋된 직후 모의 공급자가 `BILLING_UNCERTAIN`(응답 유실)을 던지도록 구성한다. 기존 주문은 **동일 주문 ID의 `PENDING` 1건**으로 남고, 계정 비활성화·자동갱신 해제·유료 이용권 미부여를 확인한다. 탈퇴 뒤 직접 청구·스케줄러 호출은 공급자에 새 `charge()`나 자동 `lookup()`을 보내지 않아야 한다. 이는 **외부 승인 여부 미확정 상태를 보존**하는 동작만 검증하며, 실제 결제 성공·취소·환불 판단의 근거가 아니다. 미확정 주문은 승인된 운영 절차에서 동일 주문 ID로 **조회 전용 대사**해야 하며, 승인 전에는 새 청구나 임의 환불을 실행하지 않는다. 이 테스트를 포함한 `eb8f6908` 및 `bf9739dd`의 실행 근거는 아래에 구분한다.

**검증의 한계:** 위 테스트는 **Spring/H2의 단일 프로세스에서 공급자 응답 시점을 강제로 제어한 순차 재현(mocked in-process ordering)**이다. MySQL 8.4/9의 SQL·잠금·격리 수준별 동작, 실제 병렬 스레드·분산 인스턴스 간 경쟁, Toss 등 실제 PG 네트워크 승인/거절, 환불/취소/대사, 승인된 스테이징 E2E, Railway 운영 배포 및 운영 DB 백업·복원 성공을 입증하지 않는다. 이미 시작된 실제 청구의 결과는 주문 ID 기반으로 별도 조회·대사하고, 운영 변경은 사전 승인 후 실시해야 한다.

### 6.1. 탈퇴 도중 카드 등록·수동 재시도 완료 경합 (2026-11-03)

**추가 확인한 코드상 위험:** `BillingService.completeRegistrationWithinBudget()`은 PG에 `issueBillingKey()`를 보낸 후 별도 트랜잭션에서 `BillingSubscription.register()`를 수행했다. 외부 공급자 응답을 기다리는 사이 `AccountWithdrawalService.withdraw()`가 완료되면, 이전 코드는 탈퇴한 회원의 `autoRenew`를 다시 `true`로 설정하고 새 `billingKey`를 로컬 DB에 저장할 수 있었다. 유사하게 이미 진입한 `retryWithinBudget()`도 탈퇴 회원의 갱신을 재개할 수 있었다. 이 경합은 코드 순서로 확인한 가능성이며 실운영 발생 사례는 아니다.

**이 PR의 제한된 수정:** 두 변경 경로에서 **회원 활성 조건을 포함한 비관적 잠금 조회**인 기존 `lockActiveByMemberId()`를 사용한다. 탈퇴가 먼저 커밋된 경우 `BILLING_ACCOUNT_INACTIVE` 오류로 등록/재시도를 거부하는 것을 Spring/H2 테스트로 확인한다. 반대 순서에서 탈퇴 경로가 `autoRenew=false`를 적용하도록 구성되어 있지만, 실제 MySQL 병렬 잠금 경합의 검증 근거는 아니다. **구독 레코드가 없는 계정**의 재시도는 종전 `BILLING_SETUP_REQUIRED` 오류를 유지한다. 활성 회원의 구독은 있지만 `billingKey`가 없는 경우에는 기존 `BillingSubscription.resume()`의 `BILLING_CARD_REQUIRED` 경로이므로 두 경우를 혼동하지 않는다.

**추가 회귀 대상:** 같은 Spring/H2 설정에서 모의 `issueBillingKey()` 내부의 실제 계정 탈퇴를 완료한 후 키를 반환하게 구성하여 (1) 비활성 회원 유지, (2) 자동갱신 재활성화 방지, (3) 반환된 키의 로컬 DB 미저장, (4) 새 청구·주문 생성 방지를 확인한다. 탈퇴 완료 후 수동 `retry()`가 자동갱신을 재개하지 않는 테스트와 **구독 레코드 미존재** 오류 코드 보존 테스트도 추가했다. 이는 순차적으로 경합 경계를 제어한 테스트이며 실제 병렬성·분산 처리 검증을 대체하지 못한다.

**남은 운영 위험:** PG가 이미 발급한 결제수단 키는 **로컬 DB에 저장하지 않는 것만으로 PG 측에서 폐기됐다고 볼 수 없다.** 공급자의 키 해지·대사 API와 보존/폐기 정책을 확인한 후, 별도 승인된 조치로 처리해야 한다. 실제 PG 호출, 폐기, 운영 DB 조회·변경은 수행하지 않았다.

**CI 증빙 구분:** 기존 미확정 응답 회귀 테스트가 포함된 `eb8f6908` 커밋의 [CI #646](https://github.com/dabel11/Ttalkak/actions/runs/41317979529) 및 [Server smoke #372](https://github.com/dabel11/Ttalkak/actions/runs/41317979541)는 모두 성공했다. 신규 키 등록·재시도 수정은 그 실행에 **포함되지 않는다.** 이를 포함한 PR head `bf9739dd01046171224c9c7cb514c57b95597174`의 [CI #652](https://github.com/dabel11/Ttalkak/actions/runs/41474091913)는 **6/6 SUCCESS**, [Server smoke #377](https://github.com/dabel11/Ttalkak/actions/runs/41474091871)는 **2/2 SUCCESS**다. 이 기록은 해당 SHA의 고정 스냅샷이며, 이후 문서 정정 커밋의 CI 성공을 미리 뜻하지 않는다. 최신 PR head의 실행 결과는 PR 본문과 Checks에서 별도로 확인한다.

### 6.2. 테스트 DB 식별 근거와 재현 범위

`bf9739dd`의 [Backend tests 실행 로그](https://github.com/dabel11/Ttalkak/actions/runs/41474091913/job/125375005644)에서 `./gradlew test --no-daemon` 및 `BUILD SUCCESSFUL`을 확인했다. Actions의 `head_sha`는 PR head를 나타내며, 해당 job의 실제 checkout은 시험용 merge SHA `0fdd7cf732848cd2851bf1fbd5a51a35e9287da0`이다. 이는 PR head `bf9739dd`와 당시 base `c8164a2d`의 시험용 병합으로, 실제 병합·배포가 아니다.

DB 판정은 MySQL 컨테이너의 존재가 아니라 **테스트 task와 Spring datasource 설정**을 근거로 한다.

| 설정/실행 | 확인한 내용 | 의미 |
| --- | --- | --- |
| [`backend/build.gradle`](../build.gradle)의 `test` task | `spring.profiles.active`를 별도 지정하지 않으면 `test` 사용 | CI의 기본 Gradle 테스트는 `test` 프로필 |
| [`application-test.yml`](../src/test/resources/application-test.yml) | `jdbc:h2:mem:ttalkak-test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1`, `org.h2.Driver`, `H2Dialect`, `ddl-auto=create-drop` | 폐기 가능한 H2 인메모리 DB. MySQL 호환 모드는 MySQL 서버 실행이 아님 |
| [`BillingServiceIntegrationTest`](../src/test/java/com/ttalkak/billing/BillingServiceIntegrationTest.java) | `@SpringBootTest`에 테스트 결제 설정, `@MockitoBean BillingGateway`; datasource 재정의 없음 | 승인·거절·응답 유실 및 키 등록·재시도 회귀는 Spring/H2 + 모의 공급자 범위 |
| [CI workflow](../../.github/workflows/ci.yml)의 `Backend tests` | MySQL 8.4 서비스와 `DB_URL` 환경변수는 존재하지만 명령은 기본 `test` task | `DB_URL`은 기본 `application.yml`의 placeholder이며, `application-test.yml`의 H2 URL을 대체하지 않음 |
| `Web and Spring backend integration smoke` / `Server container smoke` | 별도 Spring 서버·MySQL 8.4·fixture RAG 또는 컨테이너 경로 | 이 작업의 성공을 위 JUnit 결제 경합 테스트가 MySQL에서 실행됐다는 증거로 사용하지 않음 |

저장소 루트에서 해당 클래스 전체를 재실행하는 명령은 다음과 같다. datasource를 바꾸는 별도 `SPRING_DATASOURCE_*` 등 환경 덮어쓰기 없이 저장소의 `test` 설정을 사용한다. JDK 17 및 Gradle/의존성이 필요하다.

```bash
./backend/gradlew -p backend -Dspring.profiles.active=test test \
  --tests 'com.ttalkak.billing.BillingServiceIntegrationTest' \
  --rerun-tasks --no-daemon
```

이 클래스에는 지연 승인(`DONE`), 지연 거절(`FAILED`), 응답 유실(`PENDING`), 늦은 키 발급, 탈퇴 후 수동 재시도, 구독 레코드 미존재 오류 보존의 **PR #83 추가 테스트 6개**가 포함된다. 개별 결과는 `backend/build/test-results/test/TEST-com.ttalkak.billing.BillingServiceIntegrationTest.xml`에서 확인한다. MySQL 검증을 추가하려면 격리된 MySQL용 datasource/driver/dialect, 실제 연결 DB 정보, 동일 테스트 메서드의 결과 및 해당 소스 SHA를 별도로 기록해야 한다.

## 7. 완료 판정

| 항목 | 완료 기준 |
| --- | --- |
| 보안 회귀 | 기존 회원 및 탈퇴 회원 접근 차단, 인증 실패 시 데이터 보존, Make 서버 기록 삭제, 자동갱신 중지 |
| 실제 운영 | 외부 백업·격리 복원 및 소급 잔존 데이터 조사 결과 확인 |
| 정책·대외 안내 | 파기/보존 기간, 외부 공급자, 공개 게시글, 결제/환불을 포함한 개인정보처리방침 및 고객 안내 확정 |
| 사업화 전 통제 | 결제 동의/해지와 실제 청구 대사, 계정 폐쇄 중 인플라이트 작업 차단, 고객 권리 처리 |

연관: [기존 탈퇴 검수 체크리스트](../../docs/ACCOUNT_WITHDRAWAL_SMOKE_CHECKLIST.md) · [운영 절차](INCIDENT_RESPONSE.md) · [병합 PR #69](https://github.com/dabel11/Ttalkak/pull/69).
