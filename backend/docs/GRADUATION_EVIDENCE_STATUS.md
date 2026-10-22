# TTALKAK 졸업프로젝트 증거 현황판 — 2026-10-21

> 이 표는 **GitHub CI 실행 사실과 실제 사용자/AI 성능 검증을 구분**하기 위한 보고서 작성용 스냅샷이다.
> 작업 기준은 `develop`. 실제 배포·데이터·외부 공급자의 결과를 새로 만들어 냈다는 뜻이 아니다.
> 보안 수정은 아직 [미병합 PR #69](https://github.com/dabel11/Ttalkak/pull/69)에 있으며 운영 서버에 반영되지 않았다.

## 1. 현재 확인 가능한 증거

| ID | 구분 | 확인된 사실 | 증거 | 입증하지 못하는 것 |
| --- | --- | --- | --- | --- |
| E-01 | 백엔드/프론트/AI/브라우저 CI | #69 HEAD `d9b0b8a`의 전체 CI 5개 작업 성공 | [CI #39514756104](https://github.com/dabel11/Ttalkak/actions/runs/39514756104), SYS-01 이력 참조 | 운영 배포 및 실제 외부 AI 품질 |
| E-02 | 웹·Spring·MySQL·fixture RAG 통합 | #69 HEAD `d9b0b8a`의 인증·사용량·합성 데이터 저장/조회·격리 복원 검사 성공 | [컨테이너 #39514756085](https://github.com/dabel11/Ttalkak/actions/runs/39514756085), SYS-02 이력 참조 | 실제 AI 생성·실사용자 저장 흐름·운영 DB 복원 |
| E-03 | 실배포 읽기 전용 검증 | 공개 HTTP 200, 무인증 401 및 CORS 403 확인 | [Staging #39514756089](https://github.com/dabel11/Ttalkak/actions/runs/39514756089), SYS-03 이력 참조 | 배포 SHA, 로그인·저장·재조회·실제 AI 품질 |
| E-04 | #69 개인정보 패치 | 비공개 전환 뒤 저장/좋아요/라이브러리·댓글·신고 참조, 관리자 메모 비노출, 탈퇴 Make 데이터 정리, 자동갱신 차단의 **코드 및 CI 검증** | [미병합 PR #69](https://github.com/dabel11/Ttalkak/pull/69) / E-01 / E-02 | `develop`에 병합되어 실제 서비스에 적용됐다는 사실 |
| E-05 | AI 평가 설계 | AI 담당자가 고정 평가셋 `uplift_set_v2.json` 48항목(Track A 31 / B 17), 다중 턴 10항목과 기존 비교기 구현 | [평가셋](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/uplift_set_v2.json), [기존 평가 도구](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/uplift_eval.py) | 결과물 향상률/검색 개선을 **완전하게** 입증한 통계 |
| E-06 | 과거 AI 실험 | `uplift_trackA_20260922.json`에는 Track A의 raw/TTALKAK 짝이 있는 9항목 기록이 확인됨 | [과거 기록](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/results/uplift_trackA_20260922.json) | Track A 31개 전체 완료, 통계적 유의성, 현재 배포 모델과의 동일성 |
| E-07 | 사람 평가 준비 | `sheet_A.csv` 및 `sheet_B.csv` 각각 95질문이 마련돼 있으나 **답변 칸 공란** | [사람 평가 가이드](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/HUMAN_REVIEW.md) | 사람 평가자 간 κ 또는 LLM Judge 신뢰도 |

**해석 원칙:** CI의 `PASS`는 해당 테스트가 검증한 경로에만 적용한다. 스테이징 GET 200은 실제 RAG 생성 성공이 아니다. 개선 전후 결과물의 우월성은 조건이 고정된 A/B 평가 및 사람 검증 전에는 결론으로 쓰지 않는다.

### SYS-01~03 실행 이력 대조 (2026-10-21 재확인)

| 증빙 | 실행 / 결론 | run 시작 → 최종 갱신 (UTC) | Actions `head_sha` |
| --- | --- | --- | --- |
| SYS-01 (과거) | [CI #39251906110](https://github.com/dabel11/Ttalkak/actions/runs/39251906110) / SUCCESS | 2026-10-19T12:25:12Z → 2026-10-19T12:28:31Z | `08b2899cfe3ab4885c41a26b2d2f94b0b7331c60` |
| SYS-02 (과거) | [Server container smoke #39245848578](https://github.com/dabel11/Ttalkak/actions/runs/39245848578) / SUCCESS | 2026-10-19T11:36:23Z → 2026-10-19T11:39:13Z | `028322aa47c7b869af5840ee687770d1c7b1d221` |
| SYS-03 (과거) | [Staging read-only acceptance #39245849067](https://github.com/dabel11/Ttalkak/actions/runs/39245849067) / SUCCESS | 2026-10-19T11:36:23Z → 2026-10-19T11:36:34Z | `028322aa47c7b869af5840ee687770d1c7b1d221` |
| SYS-01 (최신 #69) | [CI #39514756104](https://github.com/dabel11/Ttalkak/actions/runs/39514756104) / SUCCESS | 2026-10-20T23:24:02Z → 2026-10-20T23:27:16Z | `d9b0b8a702d6ac1b861fc2538d6c6fcd492fc936` |
| SYS-02 (최신 #69) | [Server container smoke #39514756085](https://github.com/dabel11/Ttalkak/actions/runs/39514756085) / SUCCESS | 2026-10-20T23:24:02Z → 2026-10-20T23:26:21Z | `d9b0b8a702d6ac1b861fc2538d6c6fcd492fc936` |
| SYS-03 (최신 #69) | [Staging read-only acceptance #39514756089](https://github.com/dabel11/Ttalkak/actions/runs/39514756089) / SUCCESS | 2026-10-20T23:24:02Z → 2026-10-20T23:24:15Z | `d9b0b8a702d6ac1b861fc2538d6c6fcd492fc936` |

- 시각은 GitHub API의 `run_started_at`과 `updated_at`이다. 최종 갱신 시각을 개별 테스트 완료 시각으로 간주하지 않는다. 최신 세 실행의 시작은 한국시간 **2026-10-21 08:24:02 KST**이다.
- 위 SHA는 실행 메타데이터의 **PR head SHA**이다. checkout 로그에서 실제 시험한 `refs/pull/69/merge` SHA는 과거 SYS-01이 `43c8d3f22307fb9de9bcde6f6375bb758bdae068`, 과거 SYS-02/03이 `3c054bd7989e7be7c724fef5fb94eb3636bee730`, 최신 세 실행이 `97c371a71b36a678f50ddd20d20380e469e0d3f1`이다. 최신 merge는 `d9b0b8a702d6ac1b861fc2538d6c6fcd492fc936`와 base `667dd331ecf25b2130b500568d9cc70d9f1be8eb`의 시험용 병합이며 **PR의 실제 병합을 뜻하지 않는다**.
- 10월 19일의 서로 다른 SHA 결과를 최신 변경의 근거로 재사용하지 않는다. 현재 #69 HEAD의 성공 근거는 **최신 세 실행 자체**이다. PR #70 문서 브랜치와 #69 검증 브랜치도 구분한다.
- SYS-01: Ubuntu Actions에서 웹/확장 검증·빌드, Backend tests(MySQL 8.4), RAG 단위 테스트, Web/Spring 통합 smoke, fixture 브라우저 E2E의 **5개 job 성공**. 통합 검사는 결정적인 RAG stub을 사용한다.
- SYS-02: Ubuntu Actions의 폐기 가능한 `ttalkak-ci` 웹/nginx·Spring·MySQL 8.4·RAG stub 환경. 로그에서 게스트 3/4회 제한, 인증·소유권, 합성 데이터 저장·조회 및 재시작 후 지속성, 비공개 참조 차단, 별도 DB 복원 후 컬럼·인덱스·제약조건 및 지정 테이블 건수 일치를 확인했다. 최신 로그에는 페이지 경계와 비공개 대상 변경 거부도 PASS다. **실사용자 데이터나 운영 DB 복구 근거가 아니다.**
- SYS-03: `https://web-production-a82d94.up.railway.app`에 토큰 없이 GET/OPTIONS 수행. `/healthz`, `/api/tags/popular`, `/api/auth/config` 200, 개인/관리 API 6개 401, 신뢰하지 않는 웹·확장 origin의 CORS 403을 확인했다. 인증 검사는 로그상 **SKIP**이다. 위 SHA는 **검사 코드의 SHA이며 배포 서버의 SHA는 미확인**이다. Google 로그인/메일 성공, AI 생성, 사용자 저장·재로그인·재조회, 결제 승인 및 #69 배포 완료는 입증하지 않는다.

## 2. 졸업프로젝트 제출 전에 확보할 최종 증거

| 우선 | 완료 항목 | 확인 방법 | 현재 |
| --- | --- | --- | --- |
| P0 | 실제 사용 흐름: 가입/로그인→개선→저장→재로그인→재조회 | **승인된 별도 테스트 계정**으로 수행. API 비용·데이터 생성 상한 합의 | 미완료 |
| P0 | 개선 효과: 원본 vs TTALKAK 실제 결과물 비교 | 고정 Track A/B, 동일 target 모델·실행 조건, 결함/환각·실패율 포함 | 과거 일부 결과 |
| P0 | 판정기의 사람 평가 타당성 | 두 평가자 독립적으로 95문항 채점, κ 및 오판 확인 | 미완료 |
| P0 | 시연 안정성 | 재현 가능한 합성 입력 2~3건과 실패 시 녹화·대체 발표 | 자료 준비 중 |
| P1 | 운영 데이터 복구 | 실제 Railway MySQL 9 **격리 복원** + 백업 출처·권한·RTO/RPO 확인 | CI MySQL 8.4만 검증 |
| P1 | #69 보안 수정 반영 | CI·리뷰→`develop` 병합→배포 SHA 확인→합성 데이터 재검증 | 미병합 / 배포 확인 미완료 |
| P2 | 유료 판매/환불/개인정보 보존 정책 | 사업화 계약·운영 주체·PG 라이브 승인, 법적 검토 | 졸프 이후 |

## 3. 발표에 넣어도 되는 문장

- “사용자 인증, 저장·재조회, 접근 권한의 주요 경로를 격리된 테스트 데이터베이스에서 자동 검증했습니다.” — E-01, E-02 출처 표기
- “실제 배포 사이트에서 기본 API 응답 및 비인가 접근 제한을 읽기 전용으로 확인했습니다.” — E-03 출처 표기
- “서비스 효과를 평가하기 위한 Track A/B 실험셋과 다중 턴 평가 체계를 구축했습니다. 최종 품질 수치는 사람 평가 및 추가 실험 후 확정합니다.” — E-05~07

**아직 쓰면 안 되는 표현:** “모든 사용자 흐름 실서버 검증 완료”, “TTALKAK이 항상 원본보다 낫다”, “운영 MySQL 백업 복구 완료”, “라이브 자동결제 준비 완료”.

## 4. 팀원 확인 요청을 최소화할 작업 구분

지금까지는 이 현황표·합성 시연 입력·기술 아키텍처·검수 시나리오를 PM 측에서 준비한다. 시험기간 이후 **한 번**의 확인에서 프론트 담당자의 실제 웹/확장 데모, AI 담당자의 평가모델·판정기·실험 결과, 백엔드/PM의 서버 배포·보안 수정 반영 상태만 각각 받는다.

관련: [검증 증빙 템플릿](GRADUATION_REPORT_EVIDENCE_TEMPLATE.md) · [졸프 검수 기준](../../docs/GRADUATION_ACCEPTANCE.md).


## 5. 최신 증빙 및 잔여 체크리스트 (2026-10-23)

> 위 2026-10-21 자료는 당시의 스냅샷이며 #69 상태 등은 현재 확정 사실로 재사용하지 않는다.

| ID | 최신 검증 사실 | 근거/한계 |
| --- | --- | --- |
| E-08 | 최신 `develop` `047453fb9c6d` CI SUCCESS | [CI #39729457041](https://github.com/dabel11/Ttalkak/actions/runs/39729457041); 실서비스 기능 성공과 별개 |
| E-09 | Railway `ttalkak-staging/production` Backend `047453fb9c6d` 배포 SUCCESS (2026-10-23 08:47 KST) | 배포 ID `20fd380c-6411-4231-8c0d-1d8a7f09dac4`; 기존 `667dd331ecf2` 대체 |
| E-10 | Backend/Web/RAG/MySQL Online; Backend replica 1/1, MySQL 연결 및 JPA 기동 성공 | Railway 환경 상태·새 백엔드 실행 로그; 계정 데이터·복원성은 미확인 |
| E-11 | 최근 1시간 Backend HTTP 요청 0건 | 실요청 5xx 또는 E2E 정상성을 검증할 트래픽 없음 |

- [x] 최신 CI 성공, Backend 최신 SHA 배포 및 기동 확인
- [ ] **기존 테스트 계정 보존**: 로그인·권한·저장 데이터 유지 검증. 계정 및 DB 초기화/삭제 금지.
- [ ] 실제 Web/API 로그인→AI 개선→저장→재로그인→재조회 E2E
- [ ] 배포 후 익명 GET/OPTIONS, CORS 및 비인가 접근 제한 재확인
- [ ] MySQL 9 백업·격리 복원, 스키마/DDL 영향 검증
- [ ] 프론트 시연·AI 고정 평가와 사람 평가 증빙
- [ ] 라이브 결제 검증 (별도 승인; 실제 결제는 없다는 사용자 진술)

배포 당시 DB 초기화·볼륨 삭제·변수 변경은 별도 수행하지 않았으나, JPA 자동 스키마 변경 여부 및 테스트 계정 보존은 독립적으로 검증해야 한다.
