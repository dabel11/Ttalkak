# Backend Integration Notes

This frontend prototype uses local in-memory arrays plus `localStorage` for most interactions. The Home screen now performs a backend smoke integration on initial load so the team can verify API traffic before replacing all local mutations.

## Current Backend Smoke Integration

- `index.html` loads `src/api.js` before `src/app.js`.
- `src/api.js` exposes `window.TTALKAK_API` for plain browser script usage.
- On startup, `src/app.js` calls `window.TTALKAK_API.getCommunityPosts()`, which requests `GET http://localhost:8080/api/prompts`.
- On startup, `src/app.js` also calls `window.TTALKAK_API.getPopularTags()`, which requests `GET http://localhost:8080/api/tags/popular`.
- On first Make entry, `src/app.js` calls `window.TTALKAK_API.getMakeThreads()`, which requests `GET http://localhost:8080/api/make/threads`.
- On first Make entry, `src/app.js` calls `window.TTALKAK_API.getMakeFolders()`, which requests `GET http://localhost:8080/api/make/folders`.
- On Make prompt submit or edited-message resend, `src/app.js` calls `window.TTALKAK_API.improvePrompt()`, which requests `POST http://localhost:8080/api/prompts/improve`.
- If the backend request succeeds, Home uses the returned prompt `items` and popular tags.
- If the backend is unavailable, the prototype keeps the demo data fallback so the screen remains reviewable.
- The top bar shows a small backend status badge:
  - `Backend 연결됨`: Home is using backend prompt/tag responses.
  - `Demo data 표시 중`: backend request failed and local demo fallback is displayed.
- Save, like, comment, reply, report, share, and unshare buttons call the matching `src/api.js` functions in the background, while the visible UI still uses optimistic local demo mutations in `src/app.js`. Login/signup store `ttalkak_access_token`, protected calls send `Authorization: Bearer ...`, 401 responses clear the token and open the login modal, and 403 responses show a permission notice. Real integration should still add final API-response rollback and response contract handling.
- Make threads/folders also remain optimistic local demo state after the smoke calls. Real integration should replace local folder/thread mutations with the final API response, dedupe server ids, and add rollback on failure.
- Make thread delete is currently local-only because the shared backend contract does not include `DELETE /api/make/threads/:id`.
- When a user creates a folder from the thread menu and immediately moves that thread, the frontend sends the move API only if the folder creation response includes a server folder id. This avoids sending temporary local ids to `PATCH /api/make/threads/:id/folder`.
- Admin operations still use local demo mutations in `src/app.js`; the matching backend authorization and audit logging should be implemented server-side.

## Local State

- Storage key: `prompt_hub_web_state_v2`
- `popularPrompts`: public prompts shown on Home.
- `savedPrompts`: saved community prompts plus owned prompts shown on My page.
- `savedByMe`: prototype-only flag equivalent to backend `isSaved`.
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
- `createdAt`
- `author`
- `isMine`
- `isShared`
- `isSaved`
- `isLiked`
- `isReported`

Comment/reply responses should include:

- `id`, `text`, `author`
- `likes`
- `edited`
- `isMine`
- `isLiked`
- `isReported`
- `replies`

## API Adapter

`src/api.js` contains the frontend-facing adapter names expected by the prototype. It has been aligned with the current UI behavior:

- prompt list/search with `sort`
- popular tags
- view count
- save/unsave
- like/unlike
- share/unshare/delete
- comments/replies CRUD
- When deleting a comment that has replies, use soft deletion: hide the original content and show a deleted-comment placeholder while preserving replies. Comments without replies can be removed from the visible list.
- comment/reply like
- prompt/comment reports
- My page list filters

## My Page Unsave UX

When a user unsaves a prompt from the My page screen:

- The card remains visible as `저장 취소 예정`.
- Pressing the save icon again restores it.
- Leaving My page commits the removal.

For backend integration, call the real unsave endpoint when pending state is committed, not when the user first clicks inside My page. On Home, prompt detail, and Make save toggles can call save/unsave immediately.

## My Page Visibility Toggle

Owned prompts in My page can switch between private and shared without opening the Share screen when the prompt already has tags. Use `PATCH /api/prompts/:id/visibility` with `isShared: true | false`. If a private prompt has no valid tags, route the user to Share so tags can be selected before publishing.

## Admin Operations

The Admin screen contains three demo panels:

- Report management: review prompt/comment/reply reports, dismiss reports, mark reports resolved, return resolved/dismissed reports to pending for reprocessing, or delete the reported target.
- Prompt management: edit/delete all prompts regardless of owner, and toggle visibility for owned prompts.
- Tag management: review tag usage and prepare future flows for approval, merge, and recommendation promotion.

Recommended backend endpoints are documented in `docs/API_SPEC.md`. Admin actions must be authorization-checked and logged server-side.

Admin moderation states should be reversible:

- Reports use `pending`, `resolved`, and `dismissed`. Resolved and dismissed reports can return to `pending` for reprocessing.
- Tags use `pending`, `approved`, and `rejected`. Approved or rejected tags can return to `pending` for re-review.
- Every state change should store reviewer, timestamp, and optional memo for auditability.

## Search And Sort

- Search supports comma-separated tags: `마케팅, 블로그`.
- Search uses AND matching: every requested tag must match.
- Home and search results share the same sort dropdown.
- Supported sorts: `popular`, `saves`, `comments`, `likes`, `latest`.
- Popular tags should be returned by tag usage count descending.
- Share tag input should search existing tags first. If matching existing tags exist, show only those existing tags.
- Show `새 태그로 추가` only when the tag search has no existing result.
- New tags should not immediately become popular/recommended tags. Promote them after admin review or after they pass a usage-count threshold.
- My page supports a liked-only view. Backend can expose this through `GET /api/prompts/my?filter=liked`.

## Modal Flows

The frontend uses custom modal flows for:

- delete prompt
- unshare prompt
- delete comment
- report prompt with reason
- report comment with reason
- execute target chooser
- auth/find-id/password-reset

Modal behavior:

- `Escape` closes the topmost open modal.
- Focus moves into the newest modal after render.
- Modal stack priority is: confirm > execute > report > auth > prompt detail.

## Demo Tools

- Demo reset and reported-prompt hide controls are exposed on Home/My page only.
- Reset clears `prompt_hub_web_state_v2` from localStorage and reloads the page.
- Make/Share intentionally do not show these demo controls to keep task screens clean.
- If demo state looks inconsistent during QA, go to Home or My page and use Demo reset.

## Auth And Admin Demo

- Google OAuth2 is represented as a frontend-only demo button. Real integration should replace it with backend OAuth redirect/token handling.
- Signup now separates `nickname` from real `name`. `nickname` is the public community display name, while `name` is account information and should not be exposed on prompt/comment cards.
- Required signup fields: `nickname`, `name`, `userId`, `password`, `passwordConfirm`, `agreeTerms`, `agreePrivacy`. Optional fields: `birth`, `phone`, `email`.
- Nickname must be unique. Prompt author, comment author, and reply author should display `nickname`, not real `name`.
- Terms and privacy consent are frontend demo checkboxes. Backend should persist consent version, consent timestamp, and user identifier for auditability.
- Optional `email` can be used for the email-based ID recovery flow. Users without a registered email should not be eligible for email-based recovery.
- Nickname and user ID duplicate checks are frontend demo buttons and should be backed by real availability-check endpoints.
- Account withdrawal now calls `DELETE /api/auth/withdraw` with `{ password }` and the stored `Authorization: Bearer ...` token. On success, the frontend clears `ttalkak_access_token`, authenticated user state, My page/Admin/Make backend caches, and returns to Home.
- Admin moderation UI is exposed through a demo toggle only for frontend review. This toggle is not a production access model.
- In the frontend demo, the Admin toggle is available only after login. If the user logs out while Admin demo mode is active, the frontend exits Admin mode and returns to Home.
- Real service should drive Admin access from authenticated account metadata such as `role: "admin"` and enforce every Admin API server-side. Hiding or showing the Admin menu in the frontend is only a convenience layer, not authorization.
- In production, logout must terminate any admin session state on both client and server so the Admin area cannot remain accessible after authentication ends.
- Admin accounts should enter an operator-oriented Admin area. They should not perform normal community actions such as liking, saving, sharing, or commenting as users while in Admin mode.
- Admins should not directly edit user-authored prompt content; they can request revisions, hide content, dismiss/resolve reports, or delete clear violations with an audit log.
- Admin prompt detail views are read-only review surfaces. Execute, like, save, share, report, comment, and reply actions are hidden in Admin mode.
- Comment and reply reports should include enough target context for moderation: target comment/reply id, parent prompt id, prompt author nickname, comment author nickname, report reason, report status, reviewer, reviewed time, and memo.
- When an admin opens a reported comment from the report list, the frontend highlights that comment in the prompt detail view. Backend responses should preserve the target id so the client can keep that context.
- Admin hide actions apply to the prompt/post unless a separate comment-level hide workflow is explicitly designed. The demo labels this as post hiding to avoid ambiguity.
- Admin deletion confirmation copy should identify the target type, for example reported comment deletion versus prompt deletion.
- Prompt edit updates title, text, and tags for the owner. Admins should use revision requests instead of directly editing user-authored prompt content.
- Admin page is prototype-only but should map to real role-based access control. Backend must enforce admin permissions server-side; hiding UI is not sufficient.

## My Page Navigation And User Activity

The current sidebar exposes `My page` as a top-level navigation item. In this prototype, My page contains user activity tabs and is not limited to only prompts that the user explicitly saved. Some frontend route/function names still use `saved` for implementation compatibility.

Role boundary:

- My page is for the current user's own activity only.
- Admin is for service-wide moderation and operations.
- My page/user-activity APIs must be scoped to the authenticated user.
- Admin APIs must require an admin role and server-side audit logging.

Current My page tabs:

- Library: prompts saved by the current user, liked-only filter, owner filters, and delayed unsave UX.
- Created prompts: prompts authored or saved from Make by the current user, including private/shared visibility switching.
- Comment management: comments and replies written by the current user. The UI can open the related prompt detail and enter edit/delete flows.
- Report history: reports submitted by the current user, including target type, reason, submitted time, and review status.

Initial account state:

- In the real service, a newly authenticated user's My page should start empty unless that user has saved, liked, authored, commented, or reported content.
- The prototype keeps sample My page content hidden by default and exposes it through a `데모 데이터 채우기` / `데모 데이터 숨기기` toggle only for QA and backend handoff review.
- Backend integration should not treat prototype seed examples as default user-owned records.

Recommended backend endpoints:

- `GET /api/me/library`
- `GET /api/me/prompts`
- `GET /api/me/comments`
- `GET /api/me/reports`

Report records should include `reporterId` or equivalent ownership metadata so users only see their own report history. Admin report management remains separate under the Admin page.

## Make Conversation Folders

Concept boundary:

- Make folders organize private conversation threads while the user is drafting or improving prompts.
- Folder creation, renaming, deletion, and thread movement are login-only features because they persist personal conversation organization.
- My page library manages final prompt artifacts: saved prompts, liked prompts, and prompts authored by the user.
- Moving a Make conversation between folders must not change whether a final prompt is saved, liked, private, or shared.
- Saving or sharing a final prompt must not require exposing the original Make conversation thread.

Make conversations can be organized into personal folders. This is only for private Make conversation management and does not affect community sharing. Community sharing still exposes the final prompt only, not the Make conversation history.

Frontend behavior:

- Default folder filters: `전체` and `미분류`.
- Users can create, rename, and delete custom folders.
- Custom Make folders are limited to 5 per user. System filters such as `전체` and `미분류` are not counted toward this limit.
- Deleting a folder does not delete conversations. Threads in that folder move to `미분류`.
- Each recent Make conversation has a compact folder move menu.
- The thread menu can also create a new custom folder and move that thread into it in one flow. The same login-only and 5-folder limit rules apply.
- New conversations created while a custom folder is active are assigned to that folder. New conversations from `전체` go to `미분류`.

Recommended backend endpoints:

- `GET /api/make/folders`
- `POST /api/make/folders`
- `PATCH /api/make/folders/:id`
- `DELETE /api/make/folders/:id`
- `PATCH /api/make/threads/:id/folder`
- Admin report management should persist report reason, target type, reporter, created time, status, reviewer, reviewed time, and reviewer memo.
- Admin prompt edits/deletes and tag moderation should produce audit logs.
- Prompt detail can execute a prompt through the same external AI chooser used by Make results.

## Make Thread Identity Policy

- Treat `threadId` / `conversationId` as the only identity for Make conversation records.
- Do not deduplicate Make conversations by message text, title, normalized prompt content, or preview.
- A user can intentionally create multiple separate conversations with the same first prompt. These should appear as separate recent conversations.
- When saving an existing conversation, update only the thread with the same `threadId`.
- Backend pagination or "load more" can be added later; the prototype limits the visible recent list for demo simplicity.

## Admin And User Action Separation

- Admin mode is an operator surface, not a normal community-user surface.
- Admins should not directly edit user-authored prompt text, tags, comments, or replies.
- Admins can request revisions, hide/unhide posts, delete clear violations, resolve/dismiss/reopen reports, and moderate tags.
- Admin detail views are read-only review surfaces. Execute, like, save, share, report, comment, and reply actions should not be exposed there.
- User-owned prompt management remains available to the owner: edit, share/unshare, delete, save/unsave, and final prompt detail review.

## Demo Data And Empty Production Defaults

- Real newly authenticated users should start with empty My page data unless they have saved, liked, authored, commented, or reported content.
- Prototype sample My page content is only for QA and backend handoff review.
- The `데모 데이터 채우기` / `데모 데이터 숨기기` control toggles sample activity visibility and should not be confused with production data seeding.
- `데모 초기화` remains a broader localStorage reset utility for frontend QA.

## Prompt Card Action Pattern

- Prompt preview cards keep owner-only management actions inside the `...` menu to avoid icon overflow.
- Prompt detail modals split actions by intent: owner management actions on the left, usage actions such as Execute/Like/Save on the right.
- This is a frontend UX pattern only; backend authorization must still validate every edit/share/delete/save request.

## Frontend Validation

The prototype currently checks:

- required login/signup fields
- password confirmation
- password minimum length: 8
- phone format
- email format when provided
- birth date cannot be in the future
- Share requires login and title/prompt/tags
- comment/reply/report inputs cannot be empty

## Chrome Extension Bridge Note

The website cannot directly insert text into ChatGPT/Gemini/Claude input fields because those pages are cross-origin. Automatic insertion requires a Chrome extension content script running on the target AI site, or an official integration/API from that site. The current website flow copies the final prompt, opens the selected AI site, and tells the user to paste it into that site's input field.
