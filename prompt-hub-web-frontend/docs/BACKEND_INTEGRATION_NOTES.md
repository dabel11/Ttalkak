# Backend Integration Notes

This frontend prototype currently uses local in-memory arrays plus `localStorage`. Replace the local mutations in `src/app.js` with API calls when the Spring Boot backend is ready.

## Local State

- Storage key: `prompt_hub_web_state_v2`
- `popularPrompts`: public prompts shown on Home.
- `savedPrompts`: saved community prompts plus owned prompts shown on Saved.
- `savedByMe`: prototype-only flag equivalent to backend `isSaved`.
- `commentsByPrompt`: comments keyed by prompt id.
- Comment objects can include one-level `replies`.
- Comment/reply objects can include `edited: true`.
- `state.popularSort`: `popular | saves | comments | likes | latest`.
- `state.pendingUnsaveIds`: prompts unsaved from Saved but not committed until the user leaves Saved.
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
- comment/reply like
- prompt/comment reports
- Saved list filters

## Saved Unsave UX

When a user unsaves a prompt from the Saved page:

- The card remains visible as `저장 취소 예정`.
- Pressing the save icon again restores it.
- Leaving Saved commits the removal.

For backend integration, call the real unsave endpoint when pending state is committed, not when the user first clicks inside Saved. On Home, prompt detail, and Make save toggles can call save/unsave immediately.

## Saved Visibility Toggle

Owned prompts in Saved can switch between private and shared without opening the Share screen when the prompt already has tags. Use `PATCH /api/prompts/:id/visibility` with `isShared: true | false`. If a private prompt has no valid tags, route the user to Share so tags can be selected before publishing.

## Admin Operations

The Admin screen contains three demo panels:

- Report management: review prompt/comment/reply reports, dismiss reports, mark reports resolved, or delete the reported target.
- Prompt management: edit/delete all prompts regardless of owner, and toggle visibility for owned prompts.
- Tag management: review tag usage and prepare future flows for approval, merge, and recommendation promotion.

Recommended backend endpoints are documented in `docs/API_SPEC.md`. Admin actions must be authorization-checked and logged server-side.

## Search And Sort

- Search supports comma-separated tags: `마케팅, 블로그`.
- Search uses AND matching: every requested tag must match.
- Home and search results share the same sort dropdown.
- Supported sorts: `popular`, `saves`, `comments`, `likes`, `latest`.
- Popular tags should be returned by tag usage count descending.
- Share tag input should search existing tags first. If matching existing tags exist, show only those existing tags.
- Show `새 태그로 추가` only when the tag search has no existing result.
- New tags should not immediately become popular/recommended tags. Promote them after admin review or after they pass a usage-count threshold.
- Saved supports a liked-only view. Backend can expose this through `GET /api/prompts/my?filter=liked`.

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

- Demo reset and reported-prompt hide controls are exposed on Home/Saved only.
- Reset clears `prompt_hub_web_state_v2` from localStorage and reloads the page.
- Make/Share intentionally do not show these demo controls to keep task screens clean.
- If demo state looks inconsistent during QA, go to Home or Saved and use Demo reset.

## Auth And Admin Demo

- Google OAuth2 is represented as a frontend-only demo button. Real integration should replace it with backend OAuth redirect/token handling.
- Signup now separates `nickname` from real `name`. `nickname` is the public community display name, while `name` is account information and should not be exposed on prompt/comment cards.
- Required signup fields: `nickname`, `name`, `userId`, `password`, `passwordConfirm`, `agreeTerms`, `agreePrivacy`. Optional fields: `birth`, `phone`, `email`.
- Nickname must be unique. Prompt author, comment author, and reply author should display `nickname`, not real `name`.
- Terms and privacy consent are frontend demo checkboxes. Backend should persist consent version, consent timestamp, and user identifier for auditability.
- Optional `email` can be used for the email-based ID recovery flow. Users without a registered email should not be eligible for email-based recovery.
- Nickname and user ID duplicate checks are frontend demo buttons and should be backed by real availability-check endpoints.
- Account withdrawal is demo-only. Backend must define account deletion, authored prompt ownership, saved prompt cleanup, comments, reports, and audit policy.
- Admin edit/delete UI is exposed through a demo toggle. Real service should drive this from a backend role such as `role: "admin"` and enforce all edit/delete actions server-side.
- Prompt edit updates title, text, and tags in the prototype. Backend should provide an update endpoint with owner/admin authorization.
- Admin page is prototype-only but should map to real role-based access control. Backend must enforce admin permissions server-side; hiding UI is not sufficient.

## Saved Navigation And User Activity

The current sidebar still exposes `Saved` as a top-level navigation item. In this prototype, `Saved` contains user activity tabs and is not limited to only prompts that the user explicitly saved.

Role boundary:

- Saved is for the current user's own activity only.
- Admin is for service-wide moderation and operations.
- Saved/user-activity APIs must be scoped to the authenticated user.
- Admin APIs must require an admin role and server-side audit logging.

Current Saved tabs:

- Saved library: prompts saved by the current user, liked-only filter, owner filters, and delayed unsave UX.
- Created prompts: prompts authored or saved from Make by the current user, including private/shared visibility switching.
- Comment management: comments and replies written by the current user. The UI can open the related prompt detail and enter edit/delete flows.
- Report history: reports submitted by the current user, including target type, reason, submitted time, and review status.

Recommended backend endpoints:

- `GET /api/me/library`
- `GET /api/me/prompts`
- `GET /api/me/comments`
- `GET /api/me/reports`

Report records should include `reporterId` or equivalent ownership metadata so users only see their own report history. Admin report management remains separate under the Admin page.

## Make Conversation Folders

Concept boundary:

- Make folders organize private conversation threads while the user is drafting or improving prompts.
- Saved library manages final prompt artifacts: saved prompts, liked prompts, and prompts authored by the user.
- Moving a Make conversation between folders must not change whether a final prompt is saved, liked, private, or shared.
- Saving or sharing a final prompt must not require exposing the original Make conversation thread.

Make conversations can be organized into personal folders. This is only for private Make conversation management and does not affect community sharing. Community sharing still exposes the final prompt only, not the Make conversation history.

Frontend behavior:

- Default folder filters: `전체` and `미분류`.
- Users can create, rename, and delete custom folders.
- Deleting a folder does not delete conversations. Threads in that folder move to `미분류`.
- Each recent Make conversation has a compact folder move menu.
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
