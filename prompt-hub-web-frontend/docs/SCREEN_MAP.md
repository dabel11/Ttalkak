# Screen Map

## Home

목적: 공유된 프롬프트 탐색과 검색

주요 기능:

- 해시태그 검색
- 쉼표 기반 복수 태그 검색 안내
- 추천 해시태그 8개
- 정렬 드롭다운: 인기, 저장, 댓글, 좋아요, 최신
- 4 x 4 카드 페이지네이션
- 프롬프트 상세 팝업
- 좋아요, 저장, 댓글, 신고, 삭제, 공유/공유 취소
- 카드를 누르면 최종 프롬프트 상세 팝업 표시

필요 데이터/API:

- `GET /api/prompts`
- `GET /api/tags/popular`
- `POST /api/prompts/:id/view`
- 사용자별 `isMine`, `isShared`, `isSaved`, `isLiked`, `isReported`
- `views`, `likes`, `comments`, `saves`, `createdAt`

## Make

목적: 사용자의 입력 프롬프트를 개선

주요 기능:

- 분야 버튼
- 비로그인 체험 횟수 안내
- 최근 대화
- 채팅형 프롬프트 개선
- Copy, Save, Execute
- Execute 시 ChatGPT/Gemini/Claude 선택 후 최종 프롬프트 복사

필요 데이터/API:

- `POST /api/prompts/improve`
- `POST /api/make/threads`
- `GET /api/make/threads`
- Make 결과 저장 API

## Saved

목적: 내 보관함. 저장한 프롬프트와 내 프롬프트 관리

주요 기능:

- 다른 사용자 프롬프트 / 내 프롬프트 체크 필터
- 좋아요만 보기 상태 필터
- Make 대화 기록이 있는 내 프롬프트의 별도 대화 보기 버튼
- 저장 취소 보류
- 내 비공개 프롬프트 공유
- 내 공유 프롬프트 공유 취소
- 내 프롬프트 삭제

필요 데이터/API:

- `GET /api/prompts/my`
- `POST /api/prompts/:id/save`
- `DELETE /api/prompts/:id/save`
- `PATCH /api/prompts/:id/visibility`
- `DELETE /api/prompts/:id`

## Share

목적: 로그인 사용자의 프롬프트 공유

주요 기능:

- 비로그인 시 로그인 유도
- 제목, 프롬프트, 해시태그 입력
- Home 카드 형태 미리보기
- 공유 대상은 최종 프롬프트만이며 Make 대화 기록은 공유하지 않음

필요 데이터/API:

- `POST /api/prompts`
- Auth token

## Prompt Detail Modal

목적: 프롬프트 전체 텍스트와 커뮤니티 반응 확인

주요 기능:

- 전체 본문
- 해시태그 클릭 검색
- 조회수 표시
- 댓글/대댓글 표시
- 좋아요, 저장, 신고, 닫기
- 댓글 작성, 수정, 삭제, 좋아요, 신고
- 대댓글 작성, 수정, 삭제, 좋아요, 신고

필요 API:

- `GET /api/prompts/:id`
- `GET /api/prompts/:id/comments`
- `POST /api/prompts/:id/comments`
- `POST /api/comments/:id/replies`
- `PATCH /api/comments/:id`
- `DELETE /api/comments/:id`
- `POST /api/comments/:id/like`
- `DELETE /api/comments/:id/like`
- `POST /api/reports/prompts/:id`
- `POST /api/reports/comments/:id`

## Auth

목적: 로그인/회원가입/계정 찾기

필요 API:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/find-id`
- `POST /api/auth/password-reset/request`
