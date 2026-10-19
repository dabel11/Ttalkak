# 회원 사용량 상태 복구

`usageAvailable=false`는 과거 요청에서 토큰 집계가 누락되었거나 요청이 만료되어 합계를 확정할 수 없다는 뜻입니다. 새 요청이 성공해도 자동 해제하지 않습니다.

관리자 계정으로 사용자 관리에서 닉네임 검색 → 사용자 활동 → 사용량 상태 조회를 누릅니다. 최근 확정 기록의 요청 ID/시간과 서버 및 AI 공급자 기록을 비교한 뒤, 검토 확인 체크와 구체적 사유를 입력하고 상태 복구를 실행합니다. 기록 목록은 최근 20건이며 전체 기록 또는 누락 요청 목록이 아닙니다.

복구는 기존 토큰 합계나 기록을 변경하지 않으며 누락량을 만들어내지 않습니다. 과거 누락량을 확정할 수 없다면 그 사실과 처리 근거를 사유에 남겨야 합니다. 검토하지 않은 계정을 일괄 초기화하지 않습니다. 실행자·대상·확정 토큰·불확실 상태 번호·사유는 관리자 감사 로그에 남습니다.

처리 중인 요청이 있으면 409로 거부합니다. 조회 이후 불확실 상태 번호 또는 확정 합계가 변경되면 재조회가 필요합니다. 복구 후 늦은 작업자가 집계 누락을 보고하면 다시 불확실 상태가 됩니다.

API: 관리자 전용 GET `/api/admin/users/{memberId}/usage`, POST `/api/admin/users/{memberId}/usage/reconcile`.
POST 본문은 `expectedRevision`, `expectedTotalTokens`, `recordsReviewed: true`, `reason`(1~1000자)을 포함해야 합니다.

DB: `member_request_lease.uncertainty_revision` bigint 기본값 0을 추가합니다. 기존 Railway 설정 `JPA_DDL_AUTO=update` 사용 시 자동 반영됩니다. validate/none 환경에서는 먼저 `ALTER TABLE member_request_lease ADD COLUMN uncertainty_revision BIGINT NOT NULL DEFAULT 0;`을 실행합니다.

# 테스트 결제 설정

Railway backend Variables에 토스페이먼츠 테스트 `TOSS_TEST_CLIENT_KEY`, `TOSS_TEST_SECRET_KEY`를 등록한 뒤 배포합니다. 운영 키를 사용하지 않습니다. 비밀 키를 PR, 채팅, 로그에 기록하지 않습니다.
키가 없는 환경은 무료 기능 및 사용량 조회를 유지하고 결제 화면에 '테스트 결제 설정 전' 안내를 표시합니다. 다른 조회 실패는 계속 오류로 표시합니다.
