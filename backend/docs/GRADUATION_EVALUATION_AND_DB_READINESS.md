# 졸업프로젝트 AI 효과 평가·DB 운영 안전성 인수인계 (2026-10-19)

> `hardening/backend-graduation-batch` Draft PR 진행 자료. 졸업프로젝트 **검증 준비**와 실제 효과 **증명**을 구분한다.
> AI 담당자의 기존 `rag-server/eval/` 소스·평가셋은 이 PR에서 **수정하지 않는다.**

## 1. 이미 있는 평가 체계 — 중복 개발하지 않을 것

| 대상 | 기존 자료 | 사용 목적·남은 근거 |
| --- | --- | --- |
| 원본 vs 개선 프롬프트의 실제 산출물 | `rag-server/eval/uplift_eval.py`, `uplift_set_v2.json` | 동일 target 모델로 A/B 실행·순서 교체 선호 판정. Track A(조건 충분) 31 / Track B(조건 부족) 17, 전체 48 |
| 검색 품질 | `rag-server/eval/run_eval.py`, `qa_set_realistic.json` | Recall@1/3/5, Precision@5, MRR@10, nDCG@5. 검색 품질과 실제 결과 품질은 분리해 기록 |
| 다중 턴 RAG 기여 | `rag-server/eval/multi_turn_eval.py`, `run_multi_turn_eval.py`, `multi_turn_set.json` | 10항목의 rag_off / rag_on / oracle 비교. 기존 공유 문서에는 3/10만 완주했다고 기록됨(작성 시점의 과거 상태) |
| 사람 검수 | `rag-server/eval/HUMAN_REVIEW.md`, `human_review/sheet_A.csv`, `sheet_B.csv` | 각 95개 요구사항 판정 질문에 **두 사람이 독립적으로 답하는 것이 우선**. 현재 체크인된 CSV는 답변 공란 |

과거 `eval/results/uplift_trackA_20260922.json`에는 9개 Track A 항목에 대한 raw/ttalkak 기록이 있다(18개 조건별 기록). **31개 전체를 완주했다는 뜻이 아니며 유의미한 품질 개선을 입증한 최종 결과로 제시할 수 없다.** `uplift_smoke_20260920.json`의 스모크 결과도 본 분석과 혼합 집계하지 않는다.

### 사람 평가 기준 — 기존 AI 담당자 문서 우선

- `HUMAN_REVIEW.md`에서 두 사람 간 Cohen κ **0.6 이상**을 제시한다.
- 평가자 간 합의가 부족하면 모호한 질문/라벨을 수정하거나 제외해야 한다.
- LLM 판정기가 사람 평가와 충분히 일치하지 않으면 요구사항 충족률은 **참고 수치**로만 표현한다.
- 사람 검토가 필요한 결함 경계 사례 5건과 Track B의 모델 작성 요청 8건도 이미 명시되어 있다. 시험기간에는 팀원에게 검토를 요구하지 않고, 이후 배포할 평가 작업으로 남긴다.
- 비교에서는 같은 실행 모델, 생성 조건, 같은 질문셋 버전과 캐시 조건을 유지하고, 모델/평가기준 변경 전후 결과를 조용히 합산하지 않는다. 비공개 사용자 대화는 공개 평가 데이터에 넣지 않는다.

## 2. 새로 추가한 자동 사전점검

```bash
python3 scripts/test-graduation-eval-readiness.py
python3 scripts/check-graduation-eval-readiness.py
```

- **오프라인/읽기 전용**: 평가 파일의 존재, ID 중복, 트랙 규모, 다중 턴 수, 사람 평가표 질문 ID 일치, 사람 답변 입력 여부, 기존 Track A raw/ttalkak 짝 수를 확인한다.
- 모델/DB/API 키가 필요 없고 생성·채점 비용을 쓰지 않는다. 결과에는 **문항 개수·검토 상태만** 출력하며 프롬프트·결과물 원문은 출력하지 않는다.
- CI에서 빠진 검수 데이터는 **진행 미완료**로 나타내되, 사람 판단이 끝나지 않았다는 이유만으로 전체 백엔드 CI를 실패시키지는 않는다. 평가 파일 자체가 손상되었거나 라벨 ID가 잘못된 경우에만 실패시킨다.
- 이 도구의 `PASS`는 **평가 자료 구조가 유효하다**는 뜻이며, 품질 향상이나 사람이 평가에 동의했다는 뜻이 아니다.

## 3. 운영 MySQL 스키마 변경 사전 조사

`backend/db/manual/schema-readiness.sql`은 **읽기 전용 information_schema 메타데이터**만 조사한다. 데이터베이스 이름/버전, 테이블 엔진, 컬럼 타입, 인덱스, 제약조건, FK 구조를 확인한다. 회원 개인정보·대화/주문 본문을 SELECT하지 않는다.

- 현재 배포 인벤토리에서 Railway MySQL 서비스는 `mysql:9`, CI 임시 DB는 `mysql:8.4`다. **CI 복원 성공을 MySQL 9 운영 복구 성공으로 간주하면 안 된다.**
- 현재 연결된 Railway 백엔드에는 `JPA_DDL_AUTO` **변수명이 존재**한다. 연결 도구에서는 실제 값이 읽히지 않으므로 `update`·`validate` 중 무엇인지 단정하지 않는다. `application.yml`의 기본값은 `update`.
- 현재 운영 DB 상태, 복구 시점, 타 계정 접근 권한, 백업 저장소는 추정하지 않는다.
- 운영 승인 후 권한이 제한된 읽기 전용 DB 계정으로 메타데이터 수집 → 인수인계 및 오프사이트 백업 점검 → MySQL 9 **격리** 복원과 테이블/컬럼/인덱스/FK 비교 → 마이그레이션 baseline 결정 → 변경별 업/다운/롤백 계획 문서화 순서로 진행한다.
- 운영 DB에 `DROP`/정리 SQL, `ddl-auto` 강제 변경, 빈 DB용 baseline 적용, 기존 볼륨 삭제는 실행하지 않는다.

## 4. 최종 발표에 사용할 증거/미완료 표시

| 평가 축 | 현재 입증 가능한 사항 | 추가 확보할 사항 |
| --- | --- | --- |
| 통합 동작 | CI의 disposable Spring/MySQL/RAG fixture 테스트 통과, 공개 스테이징 GET/OPTIONS 검증 완료 | 승인된 테스트 계정의 실환경 AI→저장→재조회, 이메일·Google E2E |
| 개인정보·인증 | PR의 소유권·세션 회귀 테스트. 비공개 전환 목록 노출 패치 검증은 PR 최신 CI 확인 필요 | 운영 패치 실제 반영 및 사용자 간 접근 재확인 |
| 데이터 보전 | MySQL 8.4 CI 백업/격리 복원 검증 | 운영 MySQL 9 실제 복구·주기적 외부 백업 |
| AI 품질 | 고정 데이터셋·평가 파이프라인·과거 일부 결과 존재 | 사람 2명 독립 검수, 편향 방지 A/B 통계, 한계 및 비용 설명 |

검수 결과는 [졸프 검수 기준](../../docs/GRADUATION_ACCEPTANCE.md), [장애 대응 절차](./INCIDENT_RESPONSE.md), [이슈 #63](https://github.com/dabel11/Ttalkak/issues/63)에서 관리한다. 팀원 리뷰 요청은 시험기간 이후 한 번에 모은다.
