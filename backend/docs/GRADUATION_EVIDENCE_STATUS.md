# TTALKAK 졸업프로젝트 증거 현황판 — 2026-10-19

> 이 표는 **GitHub CI 실행 사실과 실제 사용자/AI 성능 검증을 구분**하기 위한 보고서 작성용 스냅샷이다.
> 작업 기준은 `develop`. 실제 배포·데이터·외부 공급자의 결과를 새로 만들어 냈다는 뜻이 아니다.
> 보안 수정은 아직 [Draft PR #69](https://github.com/dabel11/Ttalkak/pull/69)에 있으며 운영 서버에 반영되지 않았다.

**질의응답 및 발표 연계:** [5분 발표 대본·질의응답](GRADUATION_PRESENTATION_SCRIPT_AND_QA.md)에 아래 증거의 확인 범위와 미완료 항목을 반영했다.

## 1. 현재 확인 가능한 증거

| ID | 구분 | 확인된 사실 | 증거 | 입증하지 못하는 것 |
| --- | --- | --- | --- | --- |
| E-01 | 백엔드/프론트/AI/브라우저 CI | [#69 커밋 `028322aa`](https://github.com/dabel11/Ttalkak/pull/69) 대상으로 전체 CI 성공 | [전체 CI #39245848345](https://github.com/dabel11/Ttalkak/actions/runs/39245848345) | 운영 서버에 #69의 보안 수정이 배포됐다는 사실 |
| E-02 | 웹·Spring·MySQL·fixture RAG 통합 | guest 한도, 회원 인증/소유권, 저장·재조회, 백업→별도 DB 복원 등 CI 테스트 성공 | [컨테이너 검사 #39245848578](https://github.com/dabel11/Ttalkak/actions/runs/39245848578) | 실제 Gemini/Groq/Jina 공급자의 AI 생성 성공과 원가 |
| E-03 | 실배포 읽기 전용 검증 | 스테이징의 공개 HTTP 상태 및 무인증 API·CORS 경계 검사가 통과 | [Staging read-only #39245849067](https://github.com/dabel11/Ttalkak/actions/runs/39245849067) | 로그인·저장·Google 메일·최종 개선 품질의 실환경 E2E |
| E-04 | #69 개인정보 패치 | 비공개 전환 뒤 저장/좋아요/라이브러리·댓글·신고 참조, 관리자 메모 비노출, 탈퇴 Make 데이터 정리, 자동갱신 차단의 **코드 및 CI 검증** | [Draft PR #69](https://github.com/dabel11/Ttalkak/pull/69) / E-01 / E-02 | `develop`에 병합되어 실제 서비스에 적용됐다는 사실 |
| E-05 | AI 평가 설계 | AI 담당자가 고정 평가셋 `uplift_set_v2.json` 48항목(Track A 31 / B 17), 다중 턴 10항목과 기존 비교기 구현 | [평가셋](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/uplift_set_v2.json), [기존 평가 도구](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/uplift_eval.py) | 결과물 향상률/검색 개선을 **완전하게** 입증한 통계 |
| E-06 | 과거 AI 실험 | `uplift_trackA_20260922.json`에는 Track A의 raw/TTALKAK 짝이 있는 9항목 기록이 확인됨 | [과거 기록](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/results/uplift_trackA_20260922.json) | Track A 31개 전체 완료, 통계적 유의성, 현재 배포 모델과의 동일성 |
| E-07 | 사람 평가 준비 | `sheet_A.csv` 및 `sheet_B.csv` 각각 95질문이 마련돼 있으나 **답변 칸 공란** | [사람 평가 가이드](https://github.com/dabel11/Ttalkak/blob/develop/rag-server/eval/HUMAN_REVIEW.md) | 사람 평가자 간 κ 또는 LLM Judge 신뢰도 |

**해석 원칙:** CI의 `PASS`는 해당 테스트가 검증한 경로에만 적용한다. 스테이징 GET 200은 실제 RAG 생성 성공이 아니다. 개선 전후 결과물의 우월성은 조건이 고정된 A/B 평가 및 사람 검증 전에는 결론으로 쓰지 않는다.

## 2. 졸업프로젝트 제출 전에 확보할 최종 증거

| 우선 | 완료 항목 | 확인 방법 | 현재 |
| --- | --- | --- | --- |
| P0 | 실제 사용 흐름: 가입/로그인→개선→저장→재로그인→재조회 | **승인된 별도 테스트 계정**으로 수행. API 비용·데이터 생성 상한 합의 | 미완료 |
| P0 | 개선 효과: 원본 vs TTALKAK 실제 결과물 비교 | 고정 Track A/B, 동일 target 모델·실행 조건, 결함/환각·실패율 포함 | 과거 일부 결과 |
| P0 | 판정기의 사람 평가 타당성 | 두 평가자 독립적으로 95문항 채점, κ 및 오판 확인 | 미완료 |
| P0 | 시연 안정성 | 재현 가능한 합성 입력 2~3건과 실패 시 녹화·대체 발표 | 자료 준비 중 |
| P1 | 운영 데이터 복구 | 실제 Railway MySQL 9 **격리 복원** + 백업 출처·권한·RTO/RPO 확인 | CI MySQL 8.4만 검증 |
| P1 | #69 보안 수정 반영 | CI·리뷰→`develop` 병합→배포 SHA 확인→합성 데이터 재검증 | Draft / 미배포 |
| P2 | 유료 판매/환불/개인정보 보존 정책 | 사업화 계약·운영 주체·PG 라이브 승인, 법적 검토 | 졸프 이후 |

## 3. 발표에 넣어도 되는 문장

- “사용자 인증, 저장·재조회, 접근 권한의 주요 경로를 격리된 테스트 데이터베이스에서 자동 검증했습니다.” — E-01, E-02 출처 표기
- “실제 배포 사이트에서 기본 API 응답 및 비인가 접근 제한을 읽기 전용으로 확인했습니다.” — E-03 출처 표기
- “서비스 효과를 평가하기 위한 Track A/B 실험셋과 다중 턴 평가 체계를 구축했습니다. 최종 품질 수치는 사람 평가 및 추가 실험 후 확정합니다.” — E-05~07

**아직 쓰면 안 되는 표현:** “모든 사용자 흐름 실서버 검증 완료”, “TTALKAK이 항상 원본보다 낫다”, “운영 MySQL 백업 복구 완료”, “라이브 자동결제 준비 완료”.

## 4. 팀원 확인 요청을 최소화할 작업 구분

지금까지는 이 현황표·합성 시연 입력·기술 아키텍처·검수 시나리오를 PM 측에서 준비한다. 시험기간 이후 **한 번**의 확인에서 프론트 담당자의 실제 웹/확장 데모, AI 담당자의 평가모델·판정기·실험 결과, 백엔드/PM의 서버 배포·보안 수정 반영 상태만 각각 받는다.

정리 자료: [5분 시연안](GRADUATION_FINAL_DEMO.md) · [보고서 증빙 템플릿](GRADUATION_REPORT_EVIDENCE_TEMPLATE.md) · [졸프 검수 기준](../../docs/GRADUATION_ACCEPTANCE.md).
