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

## Search And Sort

- Search supports comma-separated tags: `마케팅, 블로그`.
- Search uses AND matching: every requested tag must match.
- Home and search results share the same sort dropdown.
- Supported sorts: `popular`, `saves`, `comments`, `likes`, `latest`.
- Popular tags should be returned by tag usage count descending.

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

## Frontend Validation

The prototype currently checks:

- required login/signup fields
- password confirmation
- password minimum length: 8
- phone format
- birth date cannot be in the future
- Share requires login and title/prompt/tags
- comment/reply/report inputs cannot be empty

## Chrome Extension Bridge Note

The website cannot directly insert text into ChatGPT/Gemini/Claude input fields because those pages are cross-origin. Automatic insertion requires a Chrome extension content script running on the target AI site, or an official integration/API from that site. The current website flow copies the final prompt, opens the selected AI site, and tells the user to paste it into that site's input field.
