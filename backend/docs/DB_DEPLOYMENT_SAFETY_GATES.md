# TTALKAK 배포 전 DB 스키마 안전 점검 (미실행 체크리스트)

> 목적: 현재 Railway 환경에 최신 `develop`을 적용하기 전에 데이터 보전과 JPA 시작 실패 위험을 분리해 확인한다. 이 문서는 **절차만** 정의한다. 운영 DB 조회, 변수 변경, 백업 실행, 배포 또는 PR 생성은 하지 않았다.

## 확인된 기준과 미확인 사항

- 2026-10-21 점검 당시 GitHub `develop`의 병합 커밋은 `75ded8a3`; 이 커밋의 GitHub CI는 성공했다.
- 당시 Railway `ttalkak-staging`의 실제 환경 이름은 `production`. 백엔드/웹/RAG 최근 성공 배포는 `667dd331` (10월 19일). 프로젝트 이름에 staging이 있어도 실사용 환경이 아니라고 단정할 수 없다.
- 백엔드 `application.yml`은 `spring.jpa.hibernate.ddl-auto: ${JPA_DDL_AUTO:update}`를 사용한다. 관리자가 확인한 당시 Railway 변수 값은 `update`였다.
- Railway 장애 공지에서 빌드 중단이 확인되었다. **플랫폼 복구와 새 빌드 가능 여부를 먼저 확인**한다.
- 운영 MySQL 구조·정상 복원 가능한 외부 백업·애플리케이션 계정의 DDL 권한·실제 트래픽/결제 이용 여부는 아직 미검증이다.
- CI의 임시 MySQL 8.4 복원 성공은 Railway MySQL 9 운영 데이터의 복원 성공을 의미하지 않는다.

## Railway MySQL 실제 구성에 대한 읽기 전용 확인 (2026-10-21)

- MySQL 서비스 이미지: `mysql:9`; 영구 볼륨 `mysql-volume` (`/var/lib/mysql`, 표시 크기 500MB). 볼륨 연결 자체는 **백업** 또는 복원 가능성의 증거가 아니다.
- MySQL 서비스 시작 명령에 `--disable-log-bin`이 포함돼 있다. MySQL 바이너리 로그 기반 시점 복구(PITR)에 필요한 로그가 이 설정에서는 생성되지 않으므로, 스냅샷·외부 백업 등 **별도의 복구 체계** 확인이 특히 중요하다. Railway 제공 백업 기능의 실제 활성화·주기·보관 기간은 연결된 도구로 확인되지 않았다.
- 백엔드와 DB 서비스는 최근 배포 상태가 `SUCCESS`였으나, 이것은 백업 성공 및 데이터 무결성의 증거가 아니다.
- 환경 수준에 대기 중인 patch 식별자가 노출되지만, `get_staged_changes`는 적용할 리소스 변경을 반환하지 않았다. 원인 미확인 상태에서 `accept-deploy`를 실행하지 않는다.
- 이번 확인에서는 DB 쿼리, 볼륨 조작, 백업 생성, 변수 변경, 새 배포를 수행하지 않았다.

## Railway 백업 기능 확인 및 승인 전 점검

Railway 공식 문서는 볼륨이 연결된 서비스에서 **Backups 탭**으로 수동 백업 생성, 일별/주별/월별 스케줄 관리, 백업 목록 확인 및 복원을 지원한다고 명시한다.

- 일별 백업: 24시간 간격, 6일 보관 / 주별: 7일 간격, 27일 보관 / 월별: 30일 간격, 89일 보관. 여러 일정을 병행할 수 있다. 이는 **기능의 정책**이지 TTALKAK에서 백업이 활성화되었다는 증거가 아니다.
- 수동 볼륨 백업에는 볼륨 용량 50% 제한이 명시돼 있다. 500MB로 표시된 볼륨에 대해 실제 사용량 및 백업 생성 가능 여부를 대시보드에서 확인해야 한다.
- 볼륨 백업은 **같은 프로젝트·환경에만 복원** 가능하며, 복원 시 기존 볼륨을 유지한 채 새 볼륨으로 전환하는 변경이 스테이징되고 배포하면 서비스가 재시작된다. **운영에서 Restore/Deploy를 누르는 행위는 읽기 전용 검증이 아니다.**
- Railway 공식 문서는 MySQL 단일 노드에서도 PITR 기능을 안내하지만, 현재 TTALKAK MySQL 기동 명령에는 `--disable-log-bin`이 있다. PITR 사용 가능 여부는 실제 Backups 탭 상태·필요 설정 변경·재배포 영향 확인 전까지 **미확인**으로 둔다.
- 현 연결 Railway 도구에는 볼륨 백업 목록·스케줄 전용 읽기 API가 노출되지 않으므로 실제 백업 존재 여부, 마지막 성공 날짜, 복원 가능한 시점은 확인하지 못했다.
- 배포 전 수동 확인 사항: MySQL 서비스 → `Backups`에서 **스케줄 활성화 여부, 가장 최근 성공 백업 시각, 보관 범위, 복원 경로**를 확인하고 기록한다. 설정 활성화·복원·배포는 별도 승인으로만 수행한다.
- 복구 경로는 Railway 동일 환경 볼륨 복원과, 프로젝트 외부의 격리된 논리 백업 복원을 분리한다. 실제 운영 데이터 복사·외부 저장·복원 테스트는 승인 및 접근통제 확보 후 진행한다.

공식 문서: https://docs.railway.com/volumes/backups · https://docs.railway.com/databases/mysql · https://docs.railway.com/volumes/point-in-time-recovery

## 배포 승인 전 체크 게이트

1. **배포 대상 확인**: 웹/백엔드/RAG 각각 현재 빌드 SHA, 브랜치, 환경 및 서비스 사용자 영향 확인. 이전 배포 이미지를 되돌릴 수 있는지 확인.
2. **운영 DB 보전 확인**: 실제 백업 정책·시점·외부 보관 위치·복원 담당자 확인. 비밀정보·개인 데이터가 GitHub/채팅/CI 로그에 노출되지 않도록 한다.
3. **메타데이터만 수집**: 승인받은 제한된 읽기 전용 계정으로 `backend/db/manual/schema-readiness.sql`의 `information_schema` 질의 실행. 실행 환경과 DB 버전 기록. SQL은 백업을 대신하지 않는다.
4. **격리 복원**: 운영 DB에 연결하지 않은 MySQL 9 임시 인스턴스에 백업을 복원하고 테이블·컬럼·인덱스·FK·필수 건수 등을 비교한다. 원본 데이터가 유출되지 않는 별도 보안 경계 필요.
5. **버전별 호환성 확인**: 격리 DB와 최신 애플리케이션에 `JPA_DDL_AUTO=validate`를 적용해 시작 테스트. 실패하면 오류와 누락 스키마를 기록하고, 운영 변수는 바꾸지 않는다.
6. **마이그레이션 계획**: 불일치마다 DDL, 데이터 보전 영향, 예상 잠금/중단, 사전 백업 및 실패 시 복구를 문서화. Hibernate `update`를 운영 마이그레이션 도구로 사용하지 않는다.
7. **승인형 배포**: 플랫폼 복구·백업 복원·테스트·롤백 경로 확인 후 사용자 승인으로 순차 배포한다. 실제 배포 SHA와 읽기 전용 헬스체크 결과를 기록한다. 운영에 `validate`를 적용하는 것은 호환성 검증 이후 별도로 결정한다.


## CI: MySQL 9 빈 스키마 JPA 부팅 리허설 (운영 검증 아님)

- `docker/compose.mysql9-validate.ci.yml`과 `scripts/check-disposable-mysql9-validate.sh`를 추가하고 GitHub CI의 별도 job에 연결했다.
- 명시적인 GitHub CI 환경 플래그가 없는 수동 실행은 거부한다. 컨테이너 이름은 `ttalkak-mysql9-validate-ci`로 분리하고 종료 시 임시 DB 볼륨을 제거한다. Railway 연결·운영 변수·실제 회원 데이터는 사용하지 않는다.
- 첫 실행: 비어 있는 MySQL 9 테스트 DB에 최신 앱을 `JPA_DDL_AUTO=update`로 시작해 **테스트용 스키마를 생성**한다. 두 번째 실행: **같은 임시 DB**에서 `JPA_DDL_AUTO=validate`로 시작할 수 있는지 검사한다.
- 이 성공은 '최신 엔티티가 직접 생성한 빈 DB의 검증 부팅'만 의미한다. 기존 MySQL 9 운영 DB 구조와의 차이, 기존 데이터의 보존, 백업 복구 능력 또는 실제 운영 `validate` 전환 가능성을 증명하지 않는다.
- CI 결과가 실패하면 해당 job의 빌드/부팅 상태를 확인한다. 로그에 민감정보를 첨부하지 않는다.

## 폐기 가능한 DB 복원 검사의 검증 범위

- `scripts/check-disposable-db-restore.sh`는 기존 MySQL 8.4 CI 환경의 별도 복원 DB에 대해서만 실행하며, 소스 DB를 덮어쓰지 않는다.
- 복원 전후 테이블 이름, 컬럼 정의, 인덱스, 테이블 제약조건, **외래 키 관계**, **모든 테이블의 정확한 행 수**를 비교한다. 추가로 CI fixture 테이블의 INSERT 덤프 해시를 비교한다. 가능한 경우 기본키 기준 정렬(`--order-by-primary`)로 출력 순서에 따른 오탐을 줄인다. 다만 기본키가 없거나 중복 값 정렬이 불안정한 테이블은 출력 순서에 따라 오탐이 발생할 수 있다. 해시 일치는 동일 덤프 출력의 증거이며 운영 데이터 복원 검증이 아니다.
- 복원 검사는 [GitHub Actions #39608224919](https://github.com/dabel11/Ttalkak/actions/runs/39608224919)에서 성공했다. MySQL 9 빈 DB JPA 검사는 [CI #39612280419](https://github.com/dabel11/Ttalkak/actions/runs/39612280419)에서 성공했다. 두 결과 모두 폐기 가능한 CI 환경에서만 유효하다.
- Railway MySQL 9 운영 데이터의 백업·격리 복원 및 애플리케이션 `validate` 호환성은 여전히 별도 검증이 필요하다.

## 개인정보·탈퇴·결제 회귀 검사 근거

- [CI #39608884094](https://github.com/dabel11/Ttalkak/actions/runs/39608884094): 탈퇴 전에 발급된 JWT로 결제 조회·등록·재시도를 거부하는 검사를 포함한 백엔드 테스트 통과.
- [CI #39612280419](https://github.com/dabel11/Ttalkak/actions/runs/39612280419): 비공개·삭제된 신고 대상의 관련 참조 정보 비노출 검사를 포함한 백엔드 테스트 통과.
- 위 CI 성공은 운영 반영의 증거가 아니며, 실제 외부 결제사와 사용 중 DB에서 발생할 수 있는 동시성 문제는 별도 검증해야 한다.

## 중단 조건

- Railway 빌드/대시보드 장애가 지속되는 경우
- DB 백업의 독립 복원 성공을 입증하지 못한 경우
- 운영 DB 구조와 최신 엔티티의 호환성이 미확인인 경우
- 데이터 손실·DDL 자동 변경·실결제 영향이 불분명한 경우

## 관련 자료

- `backend/db/manual/schema-readiness.sql` — 정보 스키마 읽기 전용 조회문
- `scripts/check-disposable-db-restore.sh` — **GitHub CI 전용** 폐기 가능한 DB 복원; 운영에서 실행 금지
- `backend/docs/GRADUATION_EVALUATION_AND_DB_READINESS.md` — AI 평가 및 DB 인수인계
- `backend/docs/INCIDENT_RESPONSE.md` — 장애 대응 기준


## 2026-10-22 현장 점검 업데이트 (사용자 제공 실행 결과)

> 앞선 섹션의 ‘미검증’ 기술은 **2026-10-21 당시 상태**다. 아래는 이후에 사용자가 PowerShell/Docker에서 실행해 공유한 결과이며, 독립적인 자동화 증빙이나 운영 배포 완료를 의미하지 않는다.

- 백업: Railway MySQL 9에서 `mysqldump`로 특정 DB의 SQL 논리 덤프를 생성했다고 사용자가 보고함. 파일명 `ttalkak-20261022-155310.sql`, 크기 **11,069,239 bytes**. 해당 백업은 전체 MySQL 인스턴스의 `--all-databases` 백업이 아님.
- 보관: 별도 `-secure.7z` 파일 생성 후 사용자 제공 7-Zip 테스트 결과 `7zAES`, `Everything is Ok`, 압축 크기 **4,040,163 bytes**. 암호 복구 가능성과 별도 안전 보관 위치는 추가 확인 필요. 실제 백업 및 암호는 GitHub에 보관하지 않음.
- 격리 복원: 사용자 로컬의 MySQL **9.7.4** 테스트 컨테이너에 `ttalkak_restore`로 복원했다고 보고함. 테이블 23개. 정확한 `COUNT(*)` 표본: `members=7`, `prompt_posts=4`, `comments=2`, `rag_chunk=301`, `reports=2`. 이는 표본 데이터 조회 성공이며 운영 원본과 전 테이블·해시 단위의 완전 동일성 증거는 아님.
- 애플리케이션 호환성: 최신 `develop` 로컬 이미지로 **`JPA_DDL_AUTO=validate`** 사용. 사용자가 공유한 Spring Boot 로그에 `Initialized JPA EntityManagerFactory`, `Tomcat started on port 8080`, `Started BackendApplication`이 확인됨. 첫 실행의 JWT 환경변수 누락은 별도 임시 테스트 키로 보완. API E2E 검증은 별도 필요.
- GitHub 최신 SHA: `047453fb9c6d113ae0a07bb4ff77bf3d6f3172a7`. [CI #39729457041](https://github.com/dabel11/Ttalkak/actions/runs/39729457041) 성공.
- Railway 실제 서비스: 백엔드·웹·RAG가 여전히 이전 SHA `667dd331ecf25b2130b500568d9cc70d9f1be8eb`로 실행 중. 백엔드 새 배포 요청은 Railway의 `Deploys have been paused due to an upstream issue` 오류로 거절됨. 기존 서비스/DB 변경 없이 중단됨.
- 보안 사고 후속: Railway에 비밀정보 교체 필요. DB/JWT/외부 API 키 교체 순서와 장애 영향(로그아웃·DB 접속·서비스 재시작 등)을 확인 후 수행. 현재 **교체 완료가 아님**.

### 배포 재개 시 남은 게이트

1. Railway가 신규 **빌드**를 다시 허용하는지 확인한다. 과거 배포를 재사용하는 `Redeploy`를 최신 소스 배포로 오인하지 않는다.
2. SHA 고정 여부, 이전 배포 롤백 경로, 외부 백업 암호 및 복구 절차를 확인한다.
3. 운영 JPA 설정 `update`의 자동 DDL 위험을 관리한다. 로컬 `validate` 성공은 운영 변수를 임의 변경할 근거가 아니다.
4. 기존 서비스에 최신 커밋 신규 빌드 후 배포된 SHA와 인증·프롬프트·권한·결제 관련 읽기 및 제한적 E2E 결과를 확인한다.
5. Railway 보안 공지에 따라 비밀정보를 각 제공업체에서 교체하고 재배포/재시작 및 기능 검증한다. 비밀정보 값·DB 덤프·고객 데이터는 이 저장소 또는 CI 로그에 기록하지 않는다.
