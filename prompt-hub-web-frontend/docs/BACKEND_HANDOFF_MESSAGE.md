# Backend Handoff Message

## 2026-07-14 Frontend Admin Integration Summary

The frontend now attempts real Admin API calls before local demo fallback.

- Reports: `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}/status`
- Prompts: `GET /api/admin/prompts`, `PATCH /api/admin/prompts/{id}/hide`, `PATCH /api/admin/prompts/{id}/restore`
- Revision requests: `POST /api/prompts/{promptId}/revision-requests`, `GET /api/admin/revision-requests`, `PATCH /api/admin/revision-requests/{requestId}/status`
- Comments: `PATCH /api/admin/comments/{commentId}/hide`, `PATCH /api/admin/comments/{commentId}/unhide`, `DELETE /api/admin/comments/{commentId}`
- Tags: `GET /api/admin/tags`, `PATCH /api/admin/tags/{id}/status`
- User activity: `GET /api/admin/users/{memberId}/activities`

The frontend maps report statuses as `pending`, `reviewed`, `resolved`, `dismissed`; tag statuses as `pending`, `approved`, `rejected`, `disabled`; and revision request statuses as `pending`, `approved`, `rejected`. Tag recommendation exclusion sends backend `disabled`. Admin accounts are treated as operation-only accounts: normal user actions are hidden/blocked in the UI, and the backend should enforce the same policy server-side. Admin credentials should come from backend `.env` / `ADMIN_*` seed settings, not a fixed default password. Team test credentials should follow the backend password policy, including the 12-character minimum for seeded admin passwords.

TTALKAK 웹 프론트엔드 프로토타입 전달드립니다.

현재 버전은 백엔드 없이도 전체 UX를 확인할 수 있도록 `src/app.js`의 로컬 상태와 브라우저 `localStorage` fallback을 유지합니다. 동시에 Home, Make, 인증, 저장/좋아요/댓글/공유 일부 흐름은 `src/api.js`를 통해 Spring Boot API 요청을 발생시키므로 Network 탭에서 연동 상태를 확인할 수 있습니다.

## 브랜치 목적

이 브랜치는 정식 병합용 완성본이 아니라, 백엔드 담당자가 현재 프론트엔드 데모를 직접 체험하고 API 연동 범위를 확인하기 위한 인계용 브랜치입니다.

확인 순서는 아래를 권장합니다.

1. `Home`: 인기 프롬프트, 검색 범위, 정렬, 상세 모달, 태그/작성자 검색
2. `Make`: 프롬프트 첨삭 채팅, 최근 대화, 폴더, 저장/공유/Execute
3. `My page`: 내 보관함, 내가 만든 프롬프트, 댓글 관리, 신고 내역, 데모 데이터 토글
4. `Share`: 로그인 기반 프롬프트 공유, 태그 검색/선택, 카드 미리보기
5. `Admin`: 관리자 권한 계정으로 로그인한 뒤 상단 `관리자 화면` 버튼으로 신고 관리, 프롬프트 관리, 태그 관리 확인

## 데모 한계

- 일반 로그인/회원가입 토큰 저장과 보호 API의 `Authorization: Bearer ...` 전송은 연결되어 있습니다. Google OAuth2, 관리자 권한 확정, 중복 확인, 신고/태그 검토의 최종 서버 상태 동기화는 아직 데모/부분 연동 흐름입니다.
- Google OAuth 버튼은 실제 OAuth 인증이 아니라 사용자 흐름 확인용입니다.
- Admin 화면은 프론트엔드 검수용 데모 토글입니다. 실서비스에서는 `ADMIN` 권한 검증과 감사 로그를 백엔드에서 반드시 처리해야 합니다.
- My page의 샘플 데이터는 QA용 데모 데이터이며, 실서비스 신규 사용자의 My page 기본 상태는 비어 있어야 합니다.
- 문서는 UTF-8 기준으로 작성되어 있습니다. Windows PowerShell에서 한글이 깨져 보이면 GitHub 또는 UTF-8 에디터에서 확인해주세요.

## 실행

```powershell
cd prompt-hub-web-frontend
node preview-server.cjs
```

브라우저:

```text
http://127.0.0.1:4173/
```

## 주요 파일

- `index.html`: 진입 파일
- `src/app.js`: 화면 렌더링, 로컬 상태, 데모 동작
- `src/styles.css`: 전체 UI 스타일
- `src/api.js`: 백엔드 연동용 API wrapper 초안. 현재 데모 화면은 아직 대부분 `src/app.js`의 로컬 상태로 동작합니다.
- `docs/API_SPEC.md`: API 명세 초안
- `docs/FRONTEND_HANDOFF.md`: 프론트 상태/정책 문서
- `docs/BACKEND_INTEGRATION_NOTES.md`: 백엔드 연동 메모
- `docs/SCREEN_MAP.md`: 화면별 필요 데이터

## 구현된 화면

- Home: 공유 프롬프트 목록, 해시태그 검색, 복수 태그 검색 안내, 인기 태그, 정렬 드롭다운, 페이지네이션
- Make: 프롬프트 첨삭 채팅, 분야 버튼, 최근 대화, Copy/Save/Execute
- My page: 저장한 커뮤니티 프롬프트, 내 프롬프트, 댓글, 신고 내역 관리, 저장 취소 보류
- Share: 로그인 기반 프롬프트 공유
- Auth: 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기
- Detail modal: 전체 프롬프트, 댓글/대댓글, 좋아요, 저장, 신고, 삭제, 공유 취소

## 백엔드 구현 포인트

- Auth: JWT + Google OAuth2 구조와 LOCAL 로그인 병행
- Prompt: 목록, 상세, 검색, 태그 랭킹, 조회수 증가
- Prompt sort: `popular`, `saves`, `comments`, `likes`, `latest`
- Prompt actions: 저장, 좋아요, 신고, 공유, 공유 취소, 삭제
- My page: `isMine`, `isShared`, `isSaved` 분리 필요
- Share: 커뮤니티에 공개되는 것은 최종 프롬프트만이며 Make 개인 대화 기록은 공개하지 않음
- Comment: 댓글/대댓글 작성, 수정, 삭제, 좋아요, 신고
- Make: 프롬프트 첨삭 API와 최근 대화 동기화
- Admin: 현재는 프론트엔드 데모 토글로 노출됩니다. 실제 서비스에서는 백엔드 `ADMIN` 권한 검증과 감사 로그가 필요합니다.

## UI 정책

- Home에는 공유된 프롬프트만 노출합니다.
- 다른 사용자 프롬프트에는 `공유됨` 배지를 표시하지 않습니다.
- 내 공유 프롬프트는 공유 아이콘을 짙은 녹색 채움 상태로 표시합니다.
- Share 직후 내 프롬프트는 Home에 보이지만 저장 상태는 아닙니다.
- 저장 아이콘은 `isSaved`만 기준으로 활성화해야 합니다.
- `saves`는 전체 저장 수이고 `isSaved`는 현재 사용자 저장 여부입니다. 두 값을 합쳐서 판단하면 저장 수가 0인데 저장된 것처럼 보이거나, 반대로 다른 사용자가 저장한 프롬프트가 내 저장 항목처럼 보일 수 있습니다.
- 공유 성공 후 Home으로 이동하고 최신 정렬에서 방금 공유한 프롬프트를 확인합니다.
- My page에서 저장 취소는 즉시 제거하지 않고, 화면 이동 시 확정합니다.
- My page에는 소유자 필터와 `좋아요만 보기` 상태 필터가 있습니다.
- Make 개인 대화 기록은 공개하지 않으며, 내 저장 프롬프트의 별도 `대화 보기` 액션에서만 확인합니다.
- 댓글/대댓글은 좋아요 수 내림차순으로 정렬합니다.
- 본인 댓글/대댓글은 신고 대신 수정/삭제를 제공합니다.

## 데모 상태

브라우저 localStorage에 예전 상태가 남아 있으면 UI가 이상해 보일 수 있습니다. QA 중 이상하면 Home 또는 My page 상단의 `데모 초기화`를 눌러 `prompt_hub_web_state_v2`를 초기화하면 됩니다.

## Backend Smoke Integration Summary

This branch is a frontend demo and backend handoff preview, not a production-ready integration branch.

Current backend-connected checks:

- `index.html` loads `src/api.js` before `src/app.js`.
- `src/api.js` exposes `window.TTALKAK_API` for the non-module browser prototype.
- Home calls `GET http://localhost:8080/api/prompts` on startup.
- Home calls `GET http://localhost:8080/api/tags/popular` on startup.
- If those requests succeed, the Home prompt list and popular tags use backend responses.
- If those requests fail, the UI falls back to local demo data and shows `Demo data 표시 중`.

Still demo/local-state based or partial:

- Google OAuth2 and final API-response rollback
- Make chat/folders
- My page library/activity data
- Admin moderation screens
- Final server-response rollback for save/like/comment/report/share mutations

Connected auth updates:

- Login/signup store the backend `accessToken` in `ttalkak_access_token`.
- Protected API calls send `Authorization: Bearer ...` through `src/api.js`.
- Account withdrawal calls `DELETE /api/auth/withdraw` with `{ password }`; on success the frontend clears the token, authenticated user state, My page/Admin/Make backend caches, and returns to Home.

Backend handoff check:

1. Run backend on `http://localhost:8080`.
2. Run frontend on `http://127.0.0.1:4173`.
3. Open DevTools Network tab and refresh Home.
4. Confirm `GET http://localhost:8080/api/prompts` returns `200`.
5. Confirm `GET http://localhost:8080/api/tags/popular` returns `200`.

Full QA checklist:

- See `docs/QA_CHECKLIST.md` for the recommended click-test order and the expected Network requests.

Production transition cleanup:

- Replace localStorage demo state with server state.
- Replace admin demo toggle with real `ADMIN` role checks.
- Keep new user My page empty by default; sample activity is QA/demo-only.
- Google OAuth buttons call the backend OAuth endpoint when a frontend credential is available. Backend local OAuth validation is complete; production still requires Google Cloud Console domain registration and environment variables.
- Keep token handling aligned with the final auth scheme, then add API error rollback and response contract validation before release.

## Make Smoke Integration Addendum

The latest frontend demo also emits Make-related backend requests for Network-tab verification.

Expected Make requests:

- Open Make: `GET http://localhost:8080/api/make/threads`
- Open Make: `GET http://localhost:8080/api/make/folders`
- Submit a Make prompt: `POST http://localhost:8080/api/prompts/improve`

Current Make limitation:

- Threads and folders still render optimistically from local demo state.
- Folder create/rename/delete and thread move call API wrappers in the background, but final server-response synchronization and rollback are not complete yet.
- Thread delete is local-only because the current backend contract does not list `DELETE /api/make/threads/:id`.
- New-folder-and-move sends the move request only when folder creation returns a server folder id, so the frontend does not send a temporary local folder id to the backend.
- Real integration should replace local Make mutations with backend responses, persist server ids, and handle API failures visibly.
