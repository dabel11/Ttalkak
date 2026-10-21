# TTALKAK 배포 전 DB 스키마 안전 점검 (미실행 체크리스트)

> 목적: 현재 Railway 환경에 최신 `develop`을 적용하기 전에 데이터 보전과 JPA 시작 실패 위험을 분리해 확인한다. 이 문서는 **절차만** 정의한다. 운영 DB 조회, 변수 변경, 백업 실행, 배포 또는 PR 생성은 하지 않았다.

## 확인된 기준과 미확인 사항

- 2026-10-21 점검 당시 GitHub `develop`의 병합 커밋은 `75ded8a3`; 이 커밋의 GitHub CI는 성공했다.
- 당시 Railway `ttalkak-staging`의 실제 환경 이름은 `production`. 백엔드/웹/RAG 최근 성공 배포는 `667dd331` (10월 19일). 프로젝트 이름에 staging이 있어도 실사용 환경이 아니라고 단정할 수 없다.
- 백엔드 `application.yml`은 `spring.jpa.hibernate.ddl-auto: ${JPA_DDL_AUTO:update}`를 사용한다. 관리자가 확인한 당시 Railway 변수 값은 `update`였다.
- Railway 장애 공지에서 빌드 중단이 확인되었다. **플랫폼 복구와 새 빌드 가능 여부를 먼저 확인**한다.
- 운영 MySQL 구조·정상 복원 가능한 외부 백업·애플리케이션 계정의 DDL 권한·실제 트래픽/결제 이용 여부는 아직 미검증이다.
- CI의 임시 MySQL 8.4 복원 성공은 Railway MySQL 9 운영 데이터의 복원 성공을 의미하지 않는다.

## 배포 승인 전 체크 게이트

1. **배포 대상 확인**: 웹/백엔드/RAG 각각 현재 빌드 SHA, 브랜치, 환경 및 서비스 사용자 영향 확인. 이전 배포 이미지를 되돌릴 수 있는지 확인.
2. **운영 DB 보전 확인**: 실제 백업 정책·시점·외부 보관 위치·복원 담당자 확인. 비밀정보·개인 데이터가 GitHub/채팅/CI 로그에 노출되지 않도록 한다.
3. **메타데이터만 수집**: 승인받은 제한된 읽기 전용 계정으로 `backend/db/manual/schema-readiness.sql`의 `information_schema` 질의 실행. 실행 환경과 DB 버전 기록. SQL은 백업을 대신하지 않는다.
4. **격리 복원**: 운영 DB에 연결하지 않은 MySQL 9 임시 인스턴스에 백업을 복원하고 테이블·컬럼·인덱스·FK·필수 건수 등을 비교한다. 원본 데이터가 유출되지 않는 별도 보안 경계 필요.
5. **버전별 호환성 확인**: 격리 DB와 최신 애플리케이션에 `JPA_DDL_AUTO=validate`를 적용해 시작 테스트. 실패하면 오류와 누락 스키마를 기록하고, 운영 변수는 바꾸지 않는다.
6. **마이그레이션 계획**: 불일치마다 DDL, 데이터 보전 영향, 예상 잠금/중단, 사전 백업 및 실패 시 복구를 문서화. Hibernate `update`를 운영 마이그레이션 도구로 사용하지 않는다.
7. **승인형 배포**: 플랫폼 복구·백업 복원·테스트·롤백 경로 확인 후 사용자 승인으로 순차 배포한다. 실제 배포 SHA와 읽기 전용 헬스체크 결과를 기록한다. 운영에 `validate`를 적용하는 것은 호환성 검증 이후 별도로 결정한다.

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
