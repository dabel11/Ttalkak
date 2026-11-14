# 탈퇴 중 업그레이드 결제 승인 경합 검증 (2026-11-08)

## 범위와 의도

- `fix/billing-withdrawn-upgrade-guard-20261106`에서 **테스트 키와 모의 결제 공급자만** 사용하는 회귀 테스트를 확장한다.
- 사용자가 업그레이드 결제를 시작해 주문이 `PENDING`으로 저장된 뒤, 공급자 응답 전에 탈퇴하면 뒤늦은 `DONE` 응답을 이용권 변경으로 연결하지 않는다.
- `completeUpgradePayment()`는 구독 잠금을 잡을 때 회원 활성 여부를 다시 확인한다. 탈퇴한 계정에는 `BILLING_UPGRADE_RECONCILIATION_REQUIRED`를 반환하고 주문 ID 및 `PENDING` 기록을 남겨 관리자 대사 대상으로 보존한다.
- 동일 주문에 대한 read-only `reconcileUpgrade()` 조회 결과가 `DONE`이어도 탈퇴한 계정에 유료 등급을 부여하지 않는다. 해당 메서드가 실제 회원의 탈퇴 이후 호출 가능한 API라는 의미는 아니다.

## 회귀 시나리오

1. 합성 회원 및 LIGHT 구독을 모의 승인으로 생성한다.
2. STANDARD 업그레이드 주문 생성 후 모의 `gateway.charge()` 콜백에서 실제 탈퇴 서비스를 호출한다.
3. 공급자가 `DONE`을 뒤늦게 반환했을 때, 회원 비활성/자동갱신 중지/LIGHT 이용권 유지/UPGRADE 주문 PENDING 및 주문 개수 불변을 확인한다.
4. 같은 주문을 모의 `lookup()`으로 조회해도 이용권을 변경하지 않고 추가 결제 없이 대사가 요구되는지 확인한다.

## 적용 및 검증 경계

- **GitHub CI와 로컬 Gradle 테스트 실행은 아직 수행·확인되지 않았다.** 이 문서 작성 및 코드 커밋은 테스트 성공의 근거가 아니다.
- `PENDING`은 공급자가 결제를 받지 않았다는 의미가 아니다. 공급자 `orderId` 조회, 결제금 대사, 환불 필요 여부와 환불 권한·절차는 별도 운영 정책 및 승인으로 검토한다.
- 현재 일반 환불 로직은 업그레이드 환불 자동화의 증거가 아니며, 실제 결제사 호출·취소·환불은 테스트 범위 밖이다.
- 단일 프로세스 모의 경합 시나리오이며 실제 MySQL 다중 인스턴스 락·교착 검증, 운영 DB 백업·복원 및 Railway 배포를 증명하지 않는다.
- `develop`의 최신 변경과 이 브랜치의 동기화·충돌 여부, CI 실행은 별도 확인이 필요하다. PR 생성·병합이나 운영 변경을 수행하지 않는다.

## 2026-11-09 병합 전 확인 기록 (운영 미적용)

- 기준(문서 기록 커밋 전): `develop` `ae134a530349e43d6141f85875d6b33d826d970d`, 점검 당시 작업 브랜치 `209f801540fa27f4ced5699273e63844f7ded091`. 요청한 `chore/db-deployment-safety-gates` 브랜치는 GitHub에서 찾을 수 없으므로 복원하거나 대체하지 않는다.
- GitHub compare의 공통 조상은 `415b8cacd5ac44f2e684c2342d62d7774fc33af9`. 이 점검 기준 HEAD는 `develop`보다 **3커밋 앞서고 8커밋 뒤처져 있었다**(이후 문서 커밋 제외). 현재 작업 브랜치의 차이는 `BillingService.java`, `BillingServiceIntegrationTest.java`, 본 문서 세 파일이다. 공통 조상→`develop`의 변경은 웹/스크립트 등 12개 파일로 **파일 경로가 직접 겹치지 않는다**. 이는 자동 병합 가능 또는 회귀 없음의 증거가 아니며, 재동기화·테스트는 승인된 PR 단계에서 확인한다.
- `develop` HEAD의 [CI #42444943903](https://github.com/dabel11/Ttalkak/actions/runs/42444943903)는 2026-11-08(KST) **6개 job 성공**이다. 이 브랜치의 코드·테스트는 그 CI에 포함되지 않는다. 현재 작업 브랜치 HEAD에는 GitHub Actions 실행 기록이 없다. `.github/workflows/ci.yml`은 `develop` push와 PR 이벤트로 CI를 실행한다. **이번 수정 테스트는 실행/통과 확인되지 않았다.**
- 코드 비교로 확인한 잔여 정책 차이: `BillingService.charge()`의 **이미 전송된 RENEWAL 승인 완료 처리**는 탈퇴 후에도 `BillingCharge.DONE`과 새 `PaidUsagePeriod`를 기록할 수 있다. 기존 테스트 `withdrawalDuringInflightProviderApprovalNeverRestartsAutoRenewal()`은 자동갱신이 재활성화되지 않음을 검증하도록 작성됐지만, 결제 승인 후 이용권 생성 자체의 처리 정책을 검증하지 않는다. 반면 이번 브랜치의 늦은 **UPGRADE 승인**은 탈퇴 계정에 요금제 변경을 적용하지 않고 원 주문 `PENDING`을 대사 대상으로 보존하도록 작성됐다. 두 경로의 차이가 회계·보존·환불 정책에 맞는지는 **미확정 설계 검토 사항**이며, 곧바로 결함이나 환불 완료로 단정하지 않는다.
- 후속 안전 검증: 격리된 MySQL 환경에서 신규 업그레이드 테스트 실행 → 탈퇴/승인 락 순서 점검 → 승인된 갱신/업그레이드 주문의 수동 대사·환불 정책 명확화 → 실환경과 분리된 복구 리허설. 현재 운영 PG/DB/변수·Railway·실결제 변경, 새 PR/병합/브랜치 삭제는 금지 범위이므로 수행하지 않는다.

## 2026-11-11 추가 회귀 경계 점검 (미실행)

- 기준 `develop` HEAD: `6144068cbedb319881d5c5551c7776b642c2aba6`. 지정된 `chore/db-deployment-safety-gates` 브랜치는 GitHub에서 404였다. 테스트 추가 직전 기존 작업 브랜치는 `develop` 대비 5커밋 앞서고 17커밋 뒤처져 있었다. 이후 커밋으로 수치는 달라질 수 있으며 병합 준비 완료의 근거가 아니다.
- 추가 테스트: `mismatchedUpgradeProviderResponsesNeverGrantEntitlementOrTriggerSecondCharge()` (커밋 `0872f10d31d848f9dd05dc2f4f5faa678925c783`). 합성 계정의 LIGHT→STANDARD 업그레이드에서 **잘못된 주문 ID**를 가진 공급자 `DONE` 응답과, 원래 주문 조회 시 **일치하지 않는 승인 금액**을 가진 `DONE` 응답을 순차 주입한다. 양쪽 모두 `BILLING_UNCERTAIN`, 기존 LIGHT 이용권/요금제, 원 주문 `PENDING`, 주문 개수 불변 및 재조회 시 추가 `charge()` 없음이 기대 결과다.
- **새 테스트는 작성·커밋했지만 실행하지 않았다.** 작업 브랜치 HEAD에서 자동 CI가 동작한 것이 아니다. 실제 MySQL 회귀 성공, 분산락, 결제사 정산/환불, 운영 준비 완료는 검증되지 않았다.
- `develop`의 [CI #43033273436](https://github.com/dabel11/Ttalkak/actions/runs/43033273436) 첫 실행은 2026-11-11(KST) 백엔드 테스트, MySQL 9 스키마, RAG, 프런트엔드 4개 job 성공, 브라우저 E2E 및 웹·Spring 통합 스모크 2개 job 실패였다. 실패 단계는 Playwright 의존성 설치로, 로그에 `security.ubuntu.com` 등 Ubuntu 패키지 호스트의 임시 DNS 조회 실패가 확인됐다. **E2E·통합 테스트 본문은 실행되지 않았다.** CI 자체가 녹색이라고 볼 수 없다. 실패한 두 job의 재실행을 요청했으며, 이 기록 시점에는 2차 실행이 진행 중이어서 최종 통과 여부는 미확인이다.
- 다음 검증은 새 회귀 테스트의 격리 MySQL 실행과 기존 코드 변경의 기준 브랜치 재동기화 검토다. 승인 없이 PR, 병합, 브랜치 삭제, 운영 DB/변수, Railway 배포, 실제 PG 호출·환불은 하지 않는다.

## 2026-11-12 갱신 결제 응답 검증 및 CI 재점검 (운영 미적용)

- GitHub 브랜치 목록 기준 `develop` HEAD는 `6144068cbedb319881d5c5551c7776b642c2aba6`. `chore/db-deployment-safety-gates`는 목록에 없으며 임의 복원하지 않았다. 기존 `fix/billing-withdrawn-upgrade-guard-20261106` 작업 브랜치만 수정했다.
- 테스트 커밋 [`cb902453`](https://github.com/dabel11/Ttalkak/commit/cb9024535733f8f06a3785110e118d7e4ed246e2): `mismatchedRenewalProviderResponsesKeepSameOrderPendingUntilVerified()` 추가. 신규 합성 LIGHT 회원의 첫 **RENEWAL** 승인에서 다른 `orderId`를 반환하는 `DONE` 응답, 동일 주문 조회에서 승인 금액이 다른 `DONE` 응답을 순차 검증한다. 두 결과 모두 `BILLING_UNCERTAIN` 및 기존 `PENDING` 주문·FREE 이용권 유지가 기대값이다. 이후 정확한 동일 주문 조회 결과로 1개 주문만 `DONE`으로 확정되고, 추가 `charge()` 호출 없이 LIGHT 이용권이 활성화되는지를 확인하도록 작성했다.
- **이 신규 테스트는 GitHub에 커밋했으나 실행·통과를 검증하지 않았다.** 앞선 업그레이드·탈퇴 테스트 역시 이 브랜치에서 자동 CI가 실행됐다는 근거가 없다. 이 문서는 테스트 성공이나 실결제 안전성의 증빙이 아니다.
- `develop`의 [CI #43033273436](https://github.com/dabel11/Ttalkak/actions/runs/43033273436)은 2번째 시도 후에도 최종 **failure**다. 최신 작업 중 백엔드 테스트·프런트엔드 테스트/빌드·RAG 테스트·MySQL 9 JPA 스키마 부트 4개는 성공, `Web and Spring backend integration smoke`는 실패, `Web fixture browser E2E`는 취소됐다. 스모크 실패 단계는 `Install integration browser dependencies`이며 로그에서 Ubuntu 패키지 호스트 DNS 조회 실패(`Temporary failure resolving 'security.ubuntu.com'`)를 확인했다. 브라우저 E2E의 테스트 본문은 실행되지 않았고, 통합 스모크 본문도 시작되지 않았다. **CI 전체 통과라고 판단하지 않는다.**
- 다음 우선순위는 격리된 MySQL에서 신규 `BillingServiceIntegrationTest`를 실제 실행하여 정확한 테스트 결과와 실패 로그를 확보하는 것이다. 인프라 DNS가 회복되면 기존 `develop` CI를 다시 확인하되, CI 실패를 애플리케이션 회귀로 단정하지 않는다.
- 실결제, PG 취소·환불, 운영 DB·변수, Railway 배포, PR 생성·병합, 브랜치 삭제와 팀원 영역 수정은 수행하지 않는다. 탈퇴 이후 이미 승인된 RENEWAL/UPGRADE 결제의 정산·보존 정책은 별도 검토 대상으로 유지한다.


## 격리된 MySQL 8.4에서의 재현 절차 (작성: 2026-11-13, 실행 전)

\`develop\` CI의 Backend job은 MySQL 8.4 서비스 컨테이너를 띄우지만, `backend/build.gradle`의 `test` 기본 프로필은 `test`이고 `application-test.yml`은 H2 URL·드라이버·방언을 지정한다. **`DB_URL`만 전달한 Gradle 테스트를 MySQL 연결 테스트라고 볼 수 없다.** 따라서 해당 CI의 `Backend tests` 성공은 실제 MySQL 8.4 통합 테스트 통과의 근거가 아니며, 이 별도 작업 브랜치의 신규 테스트 역시 아직 실행되지 않았다. 아래는 **로컬/임시 실험 환경에서 실행할 수 있도록 준비한 절차**이며, 작성자가 실행하거나 성공을 확인한 명령이 아니다. 작업 브랜치를 체크아웃한 뒤 **빈 테스트 전용 DB**에만 연결한다.

\`\`\`bash
# 호스트의 운영 MySQL과 다른 포트(13306)의 폐기 가능한 컨테이너.
docker run --rm -d --name ttalkak-billing-regression-mysql \
  -p 127.0.0.1:13306:3306 \
  -e MYSQL_DATABASE=ttalkak_billing_regression \
  -e MYSQL_ROOT_PASSWORD=fixture-only \
  mysql:8.4

until docker exec ttalkak-billing-regression-mysql \
    mysqladmin ping -h 127.0.0.1 -pfixture-only --silent; do sleep 2; done

(
  cd backend
  SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:13306/ttalkak_billing_regression?serverTimezone=Asia/Seoul&characterEncoding=UTF-8&useSSL=false&allowPublicKeyRetrieval=true' \
  SPRING_DATASOURCE_USERNAME=root \
  SPRING_DATASOURCE_PASSWORD=fixture-only \
  SPRING_DATASOURCE_DRIVER_CLASS_NAME=com.mysql.cj.jdbc.Driver \
  SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT=org.hibernate.dialect.MySQLDialect \
  TTALKAK_REQUIRE_MYSQL_BILLING_REGRESSION=1 \
  JWT_SECRET_BASE64='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' \
  BILLING_MODE=test \
  BILLING_STORE_SCOPE=test:legacy \
  TOSS_TEST_CLIENT_KEY=test_ck_fixture \
  TOSS_TEST_SECRET_KEY=test_sk_fixture \
  BILLING_POLL_MS=3600000 \
  ./gradlew test --tests 'com.ttalkak.billing.BillingServiceIntegrationTest' --no-daemon
)

# 실행이 종료된 뒤에만 이 테스트 컨테이너를 정리한다.
docker rm -f ttalkak-billing-regression-mysql
\`\`\`

검증 시 실제 종료 코드, 실패한 테스트 이름, \`backend/build/test-results/test/\`의 XML 결과 및 MySQL 버전을 기록한다. 중단·시간초과는 통과로 간주하지 않는다. 회귀 체크 포인트는 탈퇴 후 신규/재시도 업그레이드 차단, 승인 응답 지연과 주문 \`PENDING\` 보존, 공급자 주문 ID·승인 금액 불일치 차단, 갱신 결제의 동일 주문 조회·추가 청구 방지다. **단일 컨테이너 통합 테스트는 다중 인스턴스 경합 또는 실제 PG 정산·환불의 증거가 아니다.** Docker 또는 MySQL 초기화가 실패하면 원인을 기록하고 코드를 임의로 수정하지 않는다.


## 2026-11-13 CI 재시도와 인증-탈퇴 회귀 경계 (운영 미적용)

- 같은 \`develop\` 커밋 \`6144068cbedb319881d5c5551c7776b642c2aba6\`의 [GitHub Actions CI #43033273436](https://github.com/dabel11/Ttalkak/actions/runs/43033273436)에서 네트워크 실패 후 **failed jobs 재실행**을 요청했다. **3번째 실행은 최종 success이며 여섯 job 모두 성공**했다. 백엔드 테스트, 프런트엔드, RAG, 폐기형 MySQL 9 JPA 부팅, 웹 브라우저 E2E, 웹+Spring 통합 스모크의 GitHub 결과를 확인했다. 이전 2번째 시도의 실패 사실은 당시 기록으로 유지한다.
- 위 성공은 **\`develop\` 전용**이며, 현재 분기된 \`fix/billing-withdrawn-upgrade-guard-20261106\` 브랜치의 신규 테스트는 여전히 미실행이다. PR·머지가 없는 상태에서 \`develop\`의 녹색 결과를 수정 브랜치 합격으로 추정하지 않는다.
- [\`d2d2e8c\`](https://github.com/dabel11/Ttalkak/commit/d2d2e8ca4b02eee945ea10c9a9d545dc8fff35cc)에서 \`withdrawnMemberCannotReusePreviouslyValidAccessTokenForBillingEndpoints()\`를 추가했다. 탈퇴 전 유효하던 JWT로 청구 상태 조회가 정상 작동함을 먼저 확인하고, 실제 탈퇴 후에는 동일 토큰의 상태 조회·결제 수단 설정·재시도 요청이 모두 401로 거부되며 신규 청구가 없는지 검증하도록 **작성**했다. 아직 이 테스트를 실행하거나 성공한 것은 아니다.
- 브랜치가 공통 조상에서 갈라진 상태이므로 안전성 변경을 병합할 준비가 됐다는 의미는 아니다. 실제 MySQL 8.4 대상 회귀 테스트, 기준 브랜치 동기화 및 실제 결제 승인 후 대사 정책 검토를 남겨 둔다.

## 2026-11-14 테스트 DB 연결 증빙 보강 (운영 미적용)

- `develop` HEAD `a9780b6108813ba80fc47343a89f31cbce066592`의 [CI #43603288525](https://github.com/dabel11/Ttalkak/actions/runs/43603288525)는 6/6 성공이다. 단, `Backend tests`는 `build.gradle`의 기본 `test` 프로필에서 `application-test.yml`의 H2를 사용하도록 구성된다. **MySQL 8.4 서비스 컨테이너의 존재만으로 그 테스트가 MySQL에 연결했다고 단정하면 안 된다.** `Web and Spring backend integration smoke`의 `bootRun`은 별도 통합 과정이며 여기의 새 결제 회귀 테스트를 실행했다는 증거가 아니다.
- 해당 기존 브랜치는 `develop`과 분기된 상태(`develop` 대비 12 ahead / 44 behind, 이번 커밋 전)다. 요청한 `chore/db-deployment-safety-gates` 브랜치는 확인되지 않아 복원하지 않았다.
- 위 격리 테스트 명령에서 `DB_URL` 대신 **높은 우선순위의 `SPRING_DATASOURCE_*` 환경 변수**와 MySQL 방언을 지정한다. `TTALKAK_REQUIRE_MYSQL_BILLING_REGRESSION=1`을 함께 설정하면 `isolatedBillingRegressionMustActuallyConnectToMysqlWhenRequested()`가 JDBC 데이터베이스 제품명이 MySQL인지 검사한다. 해당 플래그를 주지 않은 보통 H2 테스트 성공은 MySQL 연결 검증을 의미하지 않는다.
- **주의:** 제품명 검사는 Spring 테스트 컨텍스트 시작 뒤 수행되므로 잘못된 DB 접속을 사전에 막는 보호장치가 아니다. `ddl-auto=create-drop`으로 인한 데이터 변경 위험 때문에 반드시 폐기 가능한 빈 테스트 전용 컨테이너에만 연결한다. 운영 DB나 공유 DB에는 절대 실행하지 않는다.
- **새 연결 검증 테스트는 작성만 했으며 이 브랜치의 Gradle 실행·MySQL 결과를 확인하지 않았다.** 운영 환경·PG·PR·병합·브랜치 삭제는 그대로 둔다.
