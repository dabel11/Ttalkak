# Backend Integration Notes

## 2026-07-14 Admin API Integration Update

The Admin UI now calls backend Admin APIs when they exist and falls back to local demo state only when those calls fail. This branch should be treated as a frontend integration preview, not as the final production contract.

Connected or attempted endpoints:

- `GET /api/admin/reports`
- `PATCH /api/admin/reports/{id}/status`
- `GET /api/admin/prompts`
- `PATCH /api/admin/prompts/{id}/hide`
- `PATCH /api/admin/prompts/{id}/restore`
- `POST /api/prompts/{promptId}/revision-requests`
- `GET /api/admin/revision-requests`
- `PATCH /api/admin/revision-requests/{requestId}/status`
- `PATCH /api/admin/comments/{commentId}/hide`
- `PATCH /api/admin/comments/{commentId}/unhide`
- `DELETE /api/admin/comments/{commentId}`
- `GET /api/admin/tags`
- `PATCH /api/admin/tags/{id}/status`
- `GET /api/admin/users/{memberId}/activities`

Frontend status mapping:

- Report status: `pending`, `reviewed`, `resolved`, `dismissed`
- Tag status: `pending`, `approved`, `rejected`, `disabled`; recommendation-excluded UI sends `disabled`.
- Revision request status: `pending`, `approved`, `rejected`.

Admin account policy:

- Admin users are operation-only accounts.
- Admin users may review Home content but cannot perform normal user actions such as Make submit, Share submit, save, like, report, comment, or personal My page actions.
- Backend should enforce the same policy with server-side authorization. Frontend hiding/disable logic is only UX protection.
- Admin credentials are configured by backend `.env` / `ADMIN_*` seed settings. The frontend no longer assumes a fixed admin account. Team test credentials should follow the backend password policy, including the 12-character minimum for seeded admin passwords.

이 문서는 `jaewon7025/web-demo-preview` 브랜치의 프론트엔드가 현재 백엔드와 어디까지 연결되어 있고, 어떤 부분이 아직 데모/optimistic 상태인지 정리합니다.

## Current Backend Smoke Integration

- `index.html` loads `src/api.js` before `src/app.js`.
- `src/api.js` exposes `window.TTALKAK_API` for plain browser script usage.
- Home startup calls `GET http://localhost:8080/api/prompts`.
- Home startup calls `GET http://localhost:8080/api/tags/popular`.
- First Make entry calls `GET http://localhost:8080/api/make/threads`.
- First Make entry calls `GET http://localhost:8080/api/make/folders`.
- Make submit and edited-message resend call `POST http://localhost:8080/api/prompts/improve`.
- Login/signup store `ttalkak_access_token`, and protected calls send `Authorization: Bearer ...`.
- 401 responses clear the stored token and open the login modal.
- 403 responses show a permission notice.
- Account withdrawal calls `DELETE http://localhost:8080/api/auth/withdraw` and clears frontend auth/local session state on success.
- Admin QA fallback: when backend login or admin APIs are unavailable, the frontend can use a demo admin session so reviewers can inspect Admin UI. This does not represent production authentication and should not be used as a backend contract.

## Backend Status Badge

- `Backend 연결됨`: Home is using backend prompt/tag responses.
- `Demo data 표시 중`: backend request failed and local demo fallback is displayed.
- Make also shows a small status message after backend smoke calls.

## Still Demo / Optimistic Areas

- My page calls `/api/me/*` when logged in, but keeps local fallback data for preview.
- Make threads/folders emit backend calls, but the UI still updates optimistically first.
- Make thread delete is local-only because the current backend contract does not list `DELETE /api/make/threads/:id`.
- If folder creation does not return a server folder id, the frontend skips the immediate move API to avoid sending temporary `folder-...` ids.
- Admin screens call real admin endpoints when an authenticated backend token is available. Real service must enforce ADMIN authorization and audit logging server-side; local fallback exists only for frontend QA.
- Google OAuth buttons call the real backend Google auth flow when a frontend credential is available. Backend local OAuth validation is complete; production still needs Google Cloud Console domain registration and environment variables. Without a configured credential, the frontend shows the button as a demo preview.
- Admin demo fallback uses the local `demo-token` only after a timeout for the known QA credential. Real admin login must return a backend token and role from `/api/auth/login`.

## Admin Account Policy

- Admin accounts are treated as operation-only accounts.
- When an admin is logged in, the frontend centers the sidebar on Admin and blocks normal community actions such as Make submit, Share submit, save, like, report, comment, prompt edit/delete/share, and folder management outside the Admin screen.
- My page is hidden for admin accounts because library, my prompts, comment management, and my reports are personal user areas. Admin report handling should happen only in Admin > Reports.
- The admin can switch to the user-facing Home screen for read/review only. Make, Share, and My page are hidden for admin accounts because they are personal/community user features.
- If an admin tries to access Make, Share, or My page directly, the frontend returns to Home and shows: `관리자 계정은 Admin 운영 기능과 Home 검토 화면만 사용할 수 있습니다.`
- Backend should mirror this policy with authorization checks. Admin APIs should allow operational actions, while community action APIs should reject admin-as-user behavior when that is the agreed service policy.
- Admin prompt review now has a frontend-only user activity lookup. Final backend support should provide admin-only endpoints for nickname lookup and user activity: authored prompts, comments, replies, reports made, and reports received.

## Prompt Improve / RAG Frontend Handling

- Make submit calls `POST /api/prompts/improve`.
- The frontend must not call FastAPI `/query` directly.
- The frontend must not store or use the FastAPI server URL, RAG server URL, vector DB URL, LLM API key, or AI provider key.
- Confirmed request path: `Frontend -> Spring Boot POST /api/prompts/improve -> FastAPI POST /query -> RAG / Vector DB / LLM -> Spring Boot -> Frontend`.
- Spring Boot owns the FastAPI `/query` request/response DTO, timeout handling, no-result handling, and final frontend response mapping.
- `src/api.js` currently accepts several response field names for compatibility: `improved_prompt`, `improvedPrompt`, `final_prompt`, `finalPrompt`, `answer`, `text`, `content`, and `prompt`.
- Recommended final field name: `improved_prompt`.
- If the response is `{ mode: "question", questions: [...] }`, the frontend renders the questions as an assistant message.
- `404` means a requested resource does not exist. It is not used for "no RAG evidence".
- If RAG finds no related evidence, Spring Boot should return `200 OK` with a field such as `rag_status: "no_evidence"` and an improved prompt based on default polishing.
- If the backend returns `429`, `500`, `503`, or `504`, the frontend shows a retry/server/AI failure notice and falls back to demo polishing.
- The prompt copied/executed from Make should remain the final improved prompt, not a long explanation of the applied techniques.

## Local State

- Storage key: `prompt_hub_web_state_v2`
- `popularPrompts`: public prompts shown on Home.
- `savedPrompts`: saved community prompts plus owned prompts shown on My page.
- `savedByMe`: prototype-only flag equivalent of backend `isSaved`.
- `commentsByPrompt`: comments keyed by prompt id.
- Comment objects can include one-level `replies`.
- Comment/reply objects can include `edited: true`.
- `state.popularSort`: `popular | saves | comments | likes | latest`.
- `state.pendingUnsaveIds`: prompts unsaved from My page but not committed until the user leaves My page.
- Shared community posts should contain the final prompt only. Do not expose Make conversation history in public prompt responses.

## Backend Fields Needed By The UI

Prompt responses should include:

- `id`, `title`, `text`, `tags`
- `views`, `likes`, `comments`, `saves`
- `createdAt`, `updatedAt`
- `author: { id, nickname }` or a consistently named `authorNickname`
- `isMine`, `isShared`, `isSaved`, `isLiked`, `isReported`

Comment/reply responses should include:

- `id`, `text`, `author`
- `likes`
- `edited`, `deleted`
- `isMine`, `isLiked`, `isReported`
- `replies`

## My Page Unsave UX

When a user unsaves a prompt from My page:

- The card can remain visible temporarily as a pending unsave state.
- Pressing the save icon again restores it.
- Leaving My page commits the removal.
- Backend integration should call the real unsave endpoint when pending state is committed. Home/detail/Make save toggles may call save/unsave immediately.

## My Page Visibility Toggle

Owned prompts in My page can switch between private and shared without opening the Share screen when the prompt already has tags. Use `PATCH /api/prompts/:id/visibility` with `isShared: true | false`. If a private prompt has no valid tags, route the user to Share so tags can be selected before publishing.

## Comment Delete Policy

When deleting a comment that has replies, use soft deletion: hide the original content and show a `삭제된 댓글입니다.` placeholder while preserving replies. Comments without replies can be removed from the visible list.
