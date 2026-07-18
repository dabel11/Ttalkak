# Backend Handoff Message

## Current Frontend State

`jaewon7025/web-demo-preview` is the frontend preview and backend handoff branch. It is still not a production branch, but the main web flows now prefer Spring Boot API responses and keep local/demo fallback only for preview continuity, offline review, or optimistic UI cases.

## Backend APIs The Frontend Calls

- Home: `GET /api/prompts`, `GET /api/tags/popular`
- Auth: login/signup/withdraw plus protected requests with `Authorization: Bearer ...`
- Make: `GET /api/make/threads`, `GET /api/make/folders`, `POST /api/prompts/improve`
- My page: `GET /api/me/library`, `GET /api/me/prompts`, `GET /api/me/comments`, `GET /api/me/reports`, author revision request status flows
- Share: logged-in prompt sharing and optional hashtags
- Admin reports: `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}/status`
- Admin prompts: `GET /api/admin/prompts`, `PATCH /api/admin/prompts/{id}/hide`, `PATCH /api/admin/prompts/{id}/restore`
- Admin author revision requests: `POST /api/admin/prompts/{promptId}/author-revision-requests`, `PATCH /api/admin/author-revision-requests/{requestId}`
- Admin revision review: `GET /api/admin/revision-requests`, `PATCH /api/admin/revision-requests/{requestId}/status`
- Admin comments: `PATCH /api/admin/comments/{commentId}/hide`, `PATCH /api/admin/comments/{commentId}/unhide`, `DELETE /api/admin/comments/{commentId}`
- Admin tags: `GET /api/admin/tags`, `PATCH /api/admin/tags/{id}/status`
- Admin user activity: `GET /api/admin/users/{memberId}/activities`
- Admin audit logs: `GET /api/admin/audit-logs`

## Important Frontend Assumptions

- Admin detection uses `user.role === "admin"`.
- Admin credentials are not hard-coded in the frontend. They depend on backend `.env` / `ADMIN_*` seed settings and backend password policy.
- Backend login timeout must not open a demo admin session.
- Admin accounts are operation-only. Make, Share, My page, and normal user write actions are hidden or blocked in the UI, and backend should continue enforcing the same policy.
- Admin prompt deletion is treated as hide/restore. There is no permanent delete action in the current frontend UI.
- Report final states remain final: `resolved` and `dismissed` are not moved back to pending.
- Tag `rejected` is final. Approved tags can move between `approved` and `disabled`.
- Admin author revision request message editing is sent as `{ message }` and only enabled while status is `pending`.

## Prompt Improvement And Chrome Extension

The website and Chrome extension call only Spring Boot:

```text
Frontend or Chrome Extension
-> Spring Boot POST /api/prompts/improve
-> FastAPI POST /query
-> RAG / Vector DB / LLM
-> Spring Boot
-> Frontend or Chrome Extension
```

The frontend and extension must not manage FastAPI server URLs or AI API keys.

Backend/AI-side policies that still need final confirmation for extension and web parity:

- Whether real `chrome-extension://...` origin requests are allowed by CORS/security settings.
- The final `ragStatus` or equivalent field for no RAG evidence.
- Error code policy for AI timeout, AI service unavailable, and rate limiting.
- Whether unauthenticated `/api/prompts/improve` has a free-trial limit and which error code identifies that limit.

Recommended response direction:

```json
{
  "answer": "개선 설명 또는 요약",
  "improvedPrompt": "개선된 최종 프롬프트",
  "sources": [],
  "ragStatus": "ok"
}
```

When RAG evidence is missing, prefer `200 OK` with `ragStatus: "no_evidence"` and a basic improved prompt rather than using `404`, because `404` should mean an actual missing resource.

## QA Notes

- If PowerShell displays broken Korean while reading docs or source files, verify in GitHub or a UTF-8 editor before treating it as file corruption.
- Demo reset clears browser local state only and does not delete backend DB data.
- New user My page should be empty by default unless explicit QA demo data is enabled.
- Saved/reported/liked local UI state is separated by account key so one user does not affect another user's Home view.
