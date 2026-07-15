# TTALKAK Web Frontend Prototype

## Current Branch Purpose

`jaewon7025/web-demo-preview` is a frontend demo and backend handoff branch. It is not the final production integration branch. The goal is to let teammates run the UI, inspect Network requests, and compare the current frontend behavior against backend API contracts.

Recommended review order:

1. Home: prompt list, search scope, sort, tags, detail modal.
2. Auth: signup/login token storage, 401 login popup, 403 permission notice, withdrawal.
3. Make: thread/folder smoke calls, `POST /api/prompts/improve`, RAG fallback states.
4. Share: logged-in sharing flow and tag selection.
5. My page: library, my prompts, comments, reports, demo data toggle.
6. Admin: report, prompt, tag, and user activity management flows. When backend admin APIs are available, the UI calls them first and falls back to local demo data only for preview continuity.

Key limitations:

- Several screens still use optimistic local state after firing API requests.
- Google OAuth calls `POST /api/auth/google` only when a Google credential is available. Backend local OAuth validation is complete; production still requires Google Cloud Console domain registration and environment variables. Without a configured frontend credential, the button clearly falls back to demo preview mode.
- Admin screens call backend admin APIs when available. Real service must still rely on server-side ADMIN authorization and audit logging.
- Admin demo fallback is only for frontend QA when the backend login/admin APIs are unavailable. It is not real authentication and should not be treated as a backend contract.
- RAG response handling is defensive and accepts multiple temporary field names. The preferred final field is `improved_prompt`.

## Admin Integration Update

The frontend now attempts real Admin API integration before using local demo fallback.

- Report list/status: `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}/status`
- Prompt management: `GET /api/admin/prompts`, `PATCH /api/admin/prompts/{id}/hide`, `PATCH /api/admin/prompts/{id}/restore`. These are hide/soft-delete and restore operations; there is no permanent delete API in the current backend policy.
- Revision requests: `POST /api/prompts/{promptId}/revision-requests`, `GET /api/admin/revision-requests`, `PATCH /api/admin/revision-requests/{requestId}/status`
- Comment moderation: `PATCH /api/admin/comments/{commentId}/hide`, `PATCH /api/admin/comments/{commentId}/unhide`, `DELETE /api/admin/comments/{commentId}`
- Tag moderation: `GET /api/admin/tags`, `PATCH /api/admin/tags/{id}/status`
- User activity lookup: `GET /api/admin/users/{memberId}/activities`

Status mapping used by the frontend:

- Reports: `pending`, `reviewed`, `resolved`, `dismissed`
- Tags: `pending`, `approved`, `rejected`, `disabled`
- Revision requests: `pending`, `approved`, `rejected`

Admin accounts are not fixed frontend credentials. Admin login depends on the backend `.env` / `ADMIN_*` seed settings and returned role. Any `admin / Admin1234!` account is only an example when the backend seed is configured that way.

Admin accounts are operation-only in this prototype. Home is read/review-oriented, while Make, Share, and My page are hidden for admin users.

See `docs/QA_CHECKLIST.md`, `docs/API_SPEC.md`, and `docs/BACKEND_INTEGRATION_NOTES.md` before backend verification.

프롬프트 첨삭 Chrome Extension의 흐름을 웹 커뮤니티로 확장한 프론트엔드 프로토타입입니다.

> 이 브랜치는 `jaewon7025/web-demo-preview` 체험용 브랜치입니다. 기존 `jaewon7025/develop` 작업물을 건드리지 않고, 팀원이 현재 웹 프론트엔드 데모 수준을 확인할 수 있도록 별도로 공유하는 용도입니다.

현재 버전은 백엔드 없이도 전체 UX를 확인할 수 있도록 `src/app.js`의 로컬 상태와 브라우저 `localStorage` fallback을 유지합니다. 동시에 Home, Make, 인증, 저장/좋아요/댓글/공유 일부 흐름은 `src/api.js`를 통해 백엔드 API 요청을 발생시키므로 Network 탭에서 연동 상태를 확인할 수 있습니다.

## 브랜치 목적

`jaewon7025/web-demo-preview`는 최종 병합용 완성본이 아니라, 백엔드 담당자와 팀원이 현재 프론트엔드 UX 흐름을 직접 체험하고 API 연동 범위를 확인하기 위한 데모/인계용 브랜치입니다.

권장 확인 순서:

1. `Home`: 인기 프롬프트, 검색 범위, 정렬, 상세 모달, 태그/작성자 검색 흐름 확인
2. `Make`: 프롬프트 첨삭 채팅, 최근 대화, 폴더, 저장/공유/Execute 흐름 확인
3. `My page`: 내 보관함, 내가 만든 프롬프트, 댓글 관리, 신고 내역, 데모 데이터 토글 확인
4. `Share`: 로그인 기반 프롬프트 공유, 태그 검색/선택, 카드 미리보기 확인
5. `Admin`: 로그인 후 상단 `관리자 데모` 버튼을 켜고 신고 관리, 프롬프트 관리, 태그 관리 확인

## 데모 한계

- 현재 동작은 `src/app.js`의 로컬 상태와 브라우저 `localStorage` 기반입니다.
- 실제 인증, Google OAuth2, 관리자 권한, 닉네임/아이디 중복 확인, 신고/태그 검토는 백엔드 연동 전 데모 흐름입니다.
- Google OAuth 버튼은 실제 OAuth 인증이 아니라 화면 흐름 확인용입니다.
- Admin 화면은 프론트엔드 검수용 데모 토글로만 노출됩니다. 실서비스에서는 반드시 서버의 관리자 권한 검증과 감사 로그가 필요합니다.
- 문서는 UTF-8 기준으로 작성되어 있습니다. Windows PowerShell에서 한글이 깨져 보일 수 있으나 GitHub/에디터에서는 UTF-8로 확인하면 됩니다.

## 팀 공유 메모

이 브랜치는 정식 병합 전 UX 확인용입니다. 팀원은 Home, Make, My page, Share, Admin 흐름을 직접 눌러보며 현재 프론트엔드 데모 수준을 확인하면 됩니다. 인증, Google OAuth, 관리자 권한, 중복 확인, 신고/태그 처리 등은 백엔드 연동 전 데모 동작입니다.

## 실행 방법

```powershell
cd prompt-hub-web-frontend
node preview-server.cjs
```

브라우저에서 아래 주소로 확인합니다.

```text
http://127.0.0.1:4173/
```

Windows에서 백그라운드로 서버를 띄우려면:

```powershell
Start-Process -FilePath "node.exe" -ArgumentList "preview-server.cjs" -WorkingDirectory "<프로젝트를 받은 경로>\prompt-hub-web-frontend" -WindowStyle Hidden
```

## 주요 화면

- `Home`: 인기 프롬프트, 해시태그 검색, 복수 태그 안내, 정렬 드롭다운, 추천 태그, 상세 팝업
- `Make`: 프롬프트 첨삭 채팅, 분야 버튼, 최근 대화, Copy/Save/Execute
- `My page`: 내 활동 화면. 내 보관함, 내가 만든 프롬프트, 댓글 관리, 신고 내역, 저장 취소 보류, 공유/공유 취소
- `Share`: 로그인 기반 프롬프트 공유
- `Auth`: 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기

## 구현된 커뮤니티 기능

- 프롬프트 공유/공유 취소
- 최종 프롬프트만 공유, Make 개인 대화 기록 비공개
- 프롬프트 저장/저장 취소
- 프롬프트 좋아요/신고/삭제
- 조회수 증가
- 정렬: 인기, 저장, 댓글, 좋아요, 최신
- 쉼표 기반 복수 해시태그 검색
- 댓글/대댓글 작성
- 댓글/대댓글 수정/삭제
- 댓글/대댓글 좋아요/신고
- 댓글/대댓글 좋아요 수 기준 정렬
- My page의 좋아요만 보기 필터
- Make 대화 기록이 있는 내 프롬프트의 별도 대화 보기 버튼

## 주요 파일

- `index.html`: 앱 진입점
- `src/app.js`: 화면 렌더링, 상태, 로컬 데모 동작
- `src/styles.css`: 전체 UI 스타일
- `src/demo-data.js`: 데모 텍스트 보정 데이터
- `src/api.js`: 백엔드 연동용 API wrapper 초안. 현재 데모 UI는 대부분 `src/app.js`의 로컬 상태로 동작하며, 실제 연동 단계에서 이 wrapper 기준으로 교체합니다.
- `preview-server.cjs`: 정적 미리보기 서버

## 백엔드 전달 문서

- `docs/API_SPEC.md`: API 명세 초안
- `docs/FRONTEND_HANDOFF.md`: 프론트 상태/정책 문서
- `docs/BACKEND_INTEGRATION_NOTES.md`: 백엔드 연동 메모
- `docs/BACKEND_HANDOFF_MESSAGE.md`: 백엔드 전달용 요약 메시지
- `docs/QA_CHECKLIST.md`: 프론트/백엔드 연동 검수 체크리스트
- `docs/SCREEN_MAP.md`: 화면별 기능/API 맵

## 백엔드 연동 시 완성할 부분

- 인증: 일반 로그인/회원가입 토큰 저장은 연결되어 있으며, Google OAuth2와 아이디/비밀번호 찾기 최종 API 연결이 남아 있습니다.
- 프롬프트 목록, 태그 랭킹, Make 첨삭은 smoke 연동되어 있으며, 검색/정렬/상세 응답 계약과 실패 rollback을 더 맞춰야 합니다.
- 저장, 좋아요, 신고, 댓글, 공유/공유 취소는 API 호출이 발생하지만 화면 상태는 아직 optimistic local state입니다.
- Make 최근 대화/폴더는 서버 id를 사용해 호출하되, 최종 서버 응답 기준 렌더링과 삭제 API 계약 확정이 남아 있습니다.
- My page와 Admin은 일부 API를 호출하지만, 실서비스에서는 서버 데이터/권한/감사 로그 기준으로 완전히 전환해야 합니다.

## 백엔드 공유 시 주의

- 이 프로토타입은 정적 프론트엔드 데모입니다. 현재 화면 동작은 `src/app.js`의 로컬 배열과 `localStorage`가 담당합니다.
- `src/api.js`와 `docs/API_SPEC.md`는 백엔드 연동 계약 초안입니다. Home/Make/Auth/일부 커뮤니티 액션은 API 요청을 발생시키지만, 화면 상태는 아직 optimistic local state를 함께 사용합니다.
- 사이드바의 `My page` 화면 안에 내 보관함, 내가 만든 프롬프트, 댓글 관리, 신고 내역 탭이 함께 들어 있습니다. 내부 route 이름은 기존 구현 호환을 위해 `saved`를 유지하지만, 사용자-facing 명칭은 `My page`입니다.
- Admin 화면은 프론트엔드 데모 토글로 노출되지만, 실제 서비스에서는 반드시 백엔드의 관리자 권한 검증과 감사 로그가 필요합니다.
- 관리자 데모가 켜진 상태에서는 일반 사용자 메뉴를 숨기고 `Admin`만 노출합니다. 관리자는 커뮤니티 사용자 행동보다 신고/콘텐츠/태그 관리에 집중하는 역할로 가정합니다.

## 참고 정책

- Home에는 공유된 프롬프트만 노출합니다.
- 다른 사용자 프롬프트에는 `공유됨` 배지를 표시하지 않습니다.
- 내 공유 프롬프트는 공유 아이콘을 짙은 녹색 채움 상태로 표시합니다.
- Share 직후 내 프롬프트는 Home에 노출되지만 저장 상태는 아닙니다.
- `내 프롬프트`와 `내가 저장한 프롬프트`는 별도 상태입니다.
- `saves`는 전체 저장 수, `isSaved`는 현재 사용자의 저장 여부입니다. 저장 아이콘 활성화는 `isSaved`를 기준으로 해야 합니다.
- My page에서 저장 취소를 누르면 즉시 사라지지 않고, 다른 화면으로 이동할 때 확정됩니다.

## Backend Smoke Integration Status

This branch is still a frontend demo and handoff branch, not a full production integration.

Currently connected to the backend:

- `index.html` loads `src/api.js` before `src/app.js`.
- `src/api.js` exposes `window.TTALKAK_API` for non-module browser usage.
- Home startup calls `GET http://localhost:8080/api/prompts`.
- Home startup calls `GET http://localhost:8080/api/tags/popular`.
- If those calls succeed, Home renders backend prompt `items` and backend popular tags.
- If those calls fail, Home falls back to demo data and shows a small fallback status badge in the top bar.
- Make first entry calls `GET http://localhost:8080/api/make/threads`.
- Make first entry calls `GET http://localhost:8080/api/make/folders`.
- Make prompt submit calls `POST http://localhost:8080/api/prompts/improve` and falls back to local demo polishing if it fails.
- The frontend calls only Spring Boot for prompt improvement. It must not call FastAPI `/query` directly and must not manage the FastAPI/RAG server URL or AI API keys.
- RAG flow is owned behind Spring Boot: `Frontend -> Spring Boot /api/prompts/improve -> FastAPI /query -> RAG / Vector DB / LLM -> Spring Boot -> Frontend`.
- Login/signup store the backend `accessToken` in `ttalkak_access_token`, and protected API calls send `Authorization: Bearer ...`.
- Account withdrawal calls `DELETE http://localhost:8080/api/auth/withdraw` with `{ password }`; on success the frontend clears auth state and server-data caches.

Still demo/local-state based:

- Google OAuth2 flow
- My page library/comment/report data calls `/api/me/*` when logged in, but keeps local demo fallback/optimistic UI for preview.
- Make chat and folders are still rendered optimistically from local state, even though smoke API calls are now emitted.
- Make thread delete remains local-only because the current backend contract does not list `DELETE /api/make/threads/:id`.
- When creating a new folder and immediately moving a thread, the frontend only sends the move request if `POST /api/make/folders` returns a server folder id. Otherwise, it keeps the local demo state and skips the move API to avoid sending a temporary local id.
- Admin screens
- Most save/like/comment/share UI state

Save, like, comment, reply, report, share, and unshare buttons now call the matching `window.TTALKAK_API` functions in the background. The visible UI still uses optimistic local demo state, but 401 responses clear the stored token and open the login modal, while 403 responses show a permission notice. Full production integration should add final API-response based rollback and response contract validation.

Backend handoff check:

1. Run the Spring Boot backend on `http://localhost:8080`.
2. Run this frontend on `http://127.0.0.1:4173`.
3. Open DevTools Network tab.
4. Refresh Home.
5. Confirm `GET http://localhost:8080/api/prompts` returns `200`.
6. Confirm `GET http://localhost:8080/api/tags/popular` returns `200`.
7. Open Make and confirm `GET http://localhost:8080/api/make/threads` returns `200`.
8. Open Make and confirm `GET http://localhost:8080/api/make/folders` returns `200`.
9. Submit a Make prompt and confirm `POST http://localhost:8080/api/prompts/improve` is requested.

If requests fail with `Failed to fetch`, check backend CORS for both `http://127.0.0.1:4173` and `http://localhost:4173`.

## Handoff Policy Notes

- Make 최근 대화는 `threadId` 기준으로 별도 저장합니다. 같은 첫 입력을 다시 보내도 기존 대화를 덮어쓰거나 삭제하지 않습니다.
- 관리자 모드는 일반 사용자 행동을 제한하고 운영 조치만 제공합니다. 관리자는 사용자 작성 콘텐츠를 직접 수정하지 않고 수정 요청, 게시물 숨김/숨김 해제, 댓글 삭제, 검토 상태 변경으로 처리합니다. 프롬프트 관리는 영구 삭제가 아니라 백엔드의 숨김/소프트 삭제 정책을 따릅니다.
- 실서비스의 신규 사용자 My page는 기본적으로 비어 있어야 합니다. 현재 샘플 보관함/댓글/신고 데이터는 데모 데이터 토글로만 확인하는 QA용 예시입니다.
- 프롬프트 카드에서는 수정/공유/삭제 같은 소유자 관리 기능을 `...` 메뉴에 묶고, 상세 모달에서는 관리 액션과 사용 액션을 분리합니다.
- 본인 댓글/대댓글은 수정/삭제만 가능하고, 다른 사용자 댓글/대댓글은 좋아요/신고가 가능합니다.
- 외부 AI 사이트 입력란에 직접 자동 입력하려면 Chrome Extension content script 또는 공식 API 연동이 필요합니다.
