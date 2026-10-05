# 배포·운영 검증 — 2026-10-06 변경안

## 이번 변경과 배포 순서

1. PR의 백엔드 테스트와 MySQL 컨테이너 검증을 모두 통과시킨다.
2. 복구 가능한 DB 백업을 확보하고, 복원한 테스트 DB에서 기존 스키마 및 새 lease 테이블을 확인한다.
3. 한도 기능은 비활성 상태로 배포한다. 새 사용량 필드·계정 세션·웹 계정 종류 보존을 확인한다.
4. RAG usage 반환 코드·배포 커밋을 확인하고 회원 요청의 실제 기록을 검증한다.
5. 팀에서 FREE/PRO 숫자·초과 기준을 확정한 뒤 해당 한도와 quota-enabled를 설정한다.
6. 실제 비로그인 체험·회원 대화·사용량·테스트 결제·메일·Google 로그인 검증 결과를 기록한다.

본 문서는 배포가 완료됐다는 보고가 아니다. 이번 환경에는 Railway·Google·Resend·Toss
설정 접근 도구, DB 접속 정보, 동의한 테스트 계정이 제공되지 않았다. 실제 환경변수,
배포 커밋, 메일 수신, 실제 결제, RAG 성공은 확인되지 않았다.

## 반복 가능한 검증

### 읽기 전용 배포 점검

```bash
python3 scripts/check-staging-readiness.py --origin https://web-production-a82d94.up.railway.app
```

기본은 공개 GET만 실행하고 환경에 JWT가 있어도 전송하지 않는다. 회원 검증은
검토한 origin에 대해 TTALKAK_CHECK_TOKEN을 로컬 환경에 설정하고 `--authenticated`를
명시해야 한다. 토큰을 명령 인수·저장소·스크린샷에 쓰지 않는다. 리다이렉트는 따르지 않는다.
읽기 확인은 AI 생성·메일 도착·결제 승인을 증명하지 않는다.

### CI의 폐기 가능한 전체 스택

```bash
docker compose -p ttalkak-ci -f docker/compose.ci.yml up -d --build
python3 scripts/check-server-guest-policy.py
docker compose -p ttalkak-ci -f docker/compose.ci.yml down -v
```

마지막 명령은 **ttalkak-ci 테스트 DB만** 삭제한다. 실제 배포에 사용하지 않는다.
CI는 MySQL/nginx/실제 Spring과 모의 RAG를 연결한다. 비로그인 3회·실패 미차감·재시작,
회원 토큰·한도·저장 결과 재조회·사용량 누락 차단·세션 로그아웃·비밀번호 변경을 검사한다.
실제 LLM/메일/Google/Toss는 이 검증에 포함되지 않는다.

## 백업과 롤백

- DB 접속 비밀번호는 MySQL 옵션 파일이나 서비스의 비밀 설정으로 전달한다.
- 현재 DB의 일관된 백업을 생성하고 격리 DB에 복원해 테이블·행 수·로그인을 확인한다.
- 데이터 복원 실험은 실제 DB에 덮어쓰지 않는다. 복원 성공까지가 백업 검증이다.
- 이번 새 테이블은 추가 변경이다. 코드 롤백 시 유지하고, 운영 중 DROP하지 않는다.
- 전체 Flyway/Liquibase 전환은 실제 information_schema와 엔티티를 비교해 baseline을
  설계한 다음 별도 PR로 한다. 기존 DB에 빈 DB용 baseline을 그대로 적용하지 않는다.
- JWT 비밀과 DB 볼륨은 유지한다. 스키마 정책을 바꿔 장애를 우회하지 않는다.

## 결제 PENDING

`backend/db/manual/operational-checks.sql`은 미해결 주문·첫 결제 미완료·사용량 불확실성을
읽기 전용으로 찾는다. 주문 나이는 기존 period_start를 사용한 근사치다.

- 공급자 상태와 기존 주문 ID를 먼저 확인한다. 새 주문 생성·재결제로 해결하지 않는다.
- 기존 재조회/재시도 API와 poll은 같은 주문·멱등 키를 유지한다.
- 카드 등록 자체가 불명확하고 billing key가 없으면 주문 poll로 해결할 수 없다.
- PENDING 동안 결제 상태와 PRO 권한은 다를 수 있다. 권한은 사용량 API의 plan을 따른다.
- 다른 작업자가 확정한 주문의 늦은 거절 응답은 갱신을 끄지 않도록 보강했다.

## 장애 관측과 완료 증거

- RAG usage missing/invalid 경고, usageUncertain, 오래된 PENDING을 함께 본다.
- 공급자 비용에는 비로그인·부분 실패·실제 중복 호출이 포함될 수 있다. 회원 사용량 합계를
  전체 운영비로 해석하지 않는다.
- healthz는 nginx 응답을 증명한다. DB 읽기 API·실제 RAG query는 별도 기준이다.
- JPA SQL 출력 기본값은 false로 바꿨다. 기존 Railway 변수가 true면 별도로 조정해야 한다.
- 검증 기록에는 배포 커밋·시각·기능·결과·오류 코드만 적는다. 키·JWT·비밀번호·복구 코드는 제외한다.

## 프론트·AI 전달 항목

- 웹 로그인 결과·identity state에 provider를 보존한다. 실제 Google/복구/비밀번호 변경 UI의
  신규 API 연결·데모 제거는 프론트 담당자가 AUTH_READINESS 규약에 따라 완료해야 한다.
- quotaEnforced와 limitReached를 구분하고, 409/429/503을 무한 자동 재시도하지 않는다.
- 확장은 실제 ID·host_permissions·API 주소와 백엔드 CORS가 일치해야 한다.
- AI 담당자는 usage JSON·thinking/cached 의미·배포 커밋·인덱싱 완료를 제공해야 한다.
