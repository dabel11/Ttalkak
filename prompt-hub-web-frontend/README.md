# TTALKAK Web Frontend

`jaewon7025/web-demo-preview` is the current frontend preview and backend handoff branch. It is not the final production branch, but most visible web flows now call Spring Boot APIs first and keep local/demo fallback only for preview continuity or backend failure cases.

## Review Order

1. Home: prompt list, search scope, sort, approved popular tags, detail modal.
2. Auth: signup/login token storage, Google OAuth button behavior, 401 login popup, 403 permission notice, withdrawal.
3. Make: domain templates, thread/folder smoke calls, `POST /api/prompts/improve`, RAG/AI fallback states.
4. Share: logged-in sharing flow, optional hashtags, Home card preview.
5. My page: library, my prompts, comments, reports, server-data rendering with demo fallback only when needed.
6. Admin: reports, prompts, tags, user activity, audit logs, author revision request flows.
7. Chrome Extension: `POST /api/prompts/improve` through Spring Boot only.

## Current Integration

- Frontend API base defaults to `http://localhost:8080`.
- Auth stores the backend access token and protected requests send `Authorization: Bearer ...`.
- Admin detection uses the backend login response `user.role === "admin"`.
- Admin credentials are not fixed in frontend code. They depend on backend `.env` / `ADMIN_*` seed settings and backend password policy.
- Backend login timeout no longer creates an automatic demo admin session.
- Prompt improvement calls only Spring Boot `POST /api/prompts/improve`. The frontend must not call FastAPI `/query` or manage RAG server URLs/API keys.
- Expected AI flow: `Frontend -> Spring Boot /api/prompts/improve -> FastAPI /query -> RAG / Vector DB / LLM -> Spring Boot -> Frontend`.

## Admin APIs Used

- Reports: `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}/status`
- Prompts: `GET /api/admin/prompts`, `PATCH /api/admin/prompts/{id}/hide`, `PATCH /api/admin/prompts/{id}/restore`
- Author revision requests: `POST /api/admin/prompts/{promptId}/author-revision-requests`, `PATCH /api/admin/author-revision-requests/{requestId}`
- Revision review: `GET /api/admin/revision-requests`, `PATCH /api/admin/revision-requests/{requestId}/status`
- Comments: `PATCH /api/admin/comments/{commentId}/hide`, `PATCH /api/admin/comments/{commentId}/unhide`, `DELETE /api/admin/comments/{commentId}`
- Tags: `GET /api/admin/tags`, `PATCH /api/admin/tags/{id}/status`
- User activity: `GET /api/admin/users/{memberId}/activities`
- Audit logs: `GET /api/admin/audit-logs`

Admin prompt removal is implemented as hide/restore, not permanent deletion.

## Status Policy

- Reports: `pending`, `reviewed`, `resolved`, `dismissed`
- Tags: `pending`, `approved`, `rejected`, `disabled`
- Author revision requests: `pending`, `acknowledged`, `completed`, `rejected`
- Admin-created author revision request message editing is allowed only while the request is `pending`.

The frontend removes reprocess/undo buttons for final report states and treats rejected tags as final. Approved tags can move between `approved` and `disabled`.

## Demo And Fallback Boundaries

- Backend responses are preferred whenever a connected API exists.
- Local/demo fallback remains for preview continuity when the backend is unavailable, for some optimistic UI transitions, and for QA sample data.
- Demo reset clears browser-side UI state only. It does not delete backend DB data.
- Google buttons use the real Google credential flow only when `window.TTALKAK_GOOGLE_CREDENTIAL` is configured. Without that setting, the UI labels the action as a Google demo.
- Make may show local demo polishing only when `/api/prompts/improve` fails or the API wrapper is unavailable.

## Chrome Extension

The extension code lives in the repository root `extension` folder. It calls Spring Boot `POST /api/prompts/improve` and does not call FastAPI `/query` directly.

Remaining extension checks:

- Confirm real `chrome-extension://...` origin requests are allowed by backend CORS/security settings.
- Confirm AI/RAG no-evidence, timeout, unavailable, and rate-limit response codes once backend/AI policies are final.
- Saved prompts and recent items are currently extension-local unless a later server sync scope is defined.

## Run

```powershell
cd prompt-hub-web-frontend
node preview-server.cjs
```

Open:

```text
http://127.0.0.1:4173/
```

## Backend Smoke Check

1. Run Spring Boot on `http://localhost:8080`.
2. Run this frontend on `http://127.0.0.1:4173`.
3. Open DevTools Network.
4. Refresh Home and confirm `GET /api/prompts` and `GET /api/tags/popular` return `200`.
5. Submit Make and confirm only `POST /api/prompts/improve` is called for prompt improvement.
6. Confirm no browser request goes directly to FastAPI `/query`, port `8000`, RAG server URL, or AI provider endpoints.
7. Login as an admin seeded by backend `.env`, then verify Admin API requests carry `Authorization: Bearer ...`.

See also:

- `docs/API_SPEC.md`
- `docs/BACKEND_INTEGRATION_NOTES.md`
- `docs/BACKEND_HANDOFF_MESSAGE.md`
- `docs/QA_CHECKLIST.md`
