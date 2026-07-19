# TTALKAK Chrome Extension

Chrome Side Panel extension for improving prompts and sending the final prompt to AI tools such as ChatGPT, Gemini, and Claude.

## Current Integration Direction

- The extension should not call the FastAPI RAG server directly.
- Prompt improvement goes through Spring Boot:

```text
Chrome extension
-> Spring Boot POST /api/prompts/improve
-> FastAPI POST /query
-> RAG / Vector DB / LLM
-> Spring Boot
-> Chrome extension
```

- Login uses the Spring Boot `POST /api/auth/login` API.
- The returned `accessToken` and user info are stored in `chrome.storage.local` and restored when the extension opens again.
- Authenticated API requests include `Authorization: Bearer {accessToken}`.
- Guest users get a persistent `X-Session-UUID` stored in `chrome.storage.local`.
- Guest prompt-improve requests include `X-Session-UUID`; logged-in requests use JWT instead.
- Trial-limit responses such as `FREE_TRIAL_LIMIT_EXCEEDED` should prompt the user to log in.
- On `401` or blocked-account responses, the extension clears the stored auth session and asks the user to log in again.
- Logged-in users sync Saved prompts through the Spring Boot saved-prompt API.
- Logged-in users sync Recents through the Spring Boot Make thread API.
- Guest Saved prompts and Recents remain local browser data.
- The extension does not replace failed backend responses with demo AI results. API failures should be surfaced to the user so integration issues are visible during testing.
- Extension-local saved prompts and recent chats must be treated as local browser data, not as server-synced website data.
- Claude currently uses clipboard fallback. ChatGPT and Gemini use page insertion where possible.

## Permission Notes

- `scripting` is the primary method for inserting prompts into supported AI sites.
- `debugger` is kept only as a last-resort fallback for ChatGPT and Gemini when DOM insertion fails.
- The background script blocks debugger fallback outside the supported ChatGPT and Gemini hosts.
- Debugger sessions are detached in a `finally` block, and detach failures are logged.
- If ChatGPT and Gemini are verified to work reliably with DOM insertion only, remove the `debugger` permission from `public/manifest.json`.

## Development

```bash
npm install
npm run build:dev
```

Load the built extension in Chrome:

```text
extension/dist
```

Chrome loading steps:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `extension/dist` folder

## Structure

- `src/main.jsx`: Side Panel React UI
- `src/styles.css`: Side Panel styles
- `public/manifest.json`: Chrome Extension Manifest V3 settings
- `public/background.js`: Side Panel opening and AI-site prompt insertion logic

## Backend Setting

Backend API URL is managed in one place through `VITE_BACKEND_API_URL`.

Development:

```text
http://localhost:8080
```

Production:

```text
Set VITE_BACKEND_API_URL to the Spring Boot HTTPS production URL.
```

The extension calls:

```text
POST /api/prompts/improve
```

The previous direct RAG URL setting is no longer the intended frontend path.

## Production Manifest

`public/manifest.json` is the development manifest and keeps localhost permissions for local testing.
`manifest.production.example.json` is the production manifest template and is used by `npm run build:prod`.
See `docs/WEB_STORE_RELEASE_CHECKLIST.md` for the Chrome Web Store release checklist and backend CORS handoff steps.

For production packaging:

1. Set `VITE_BACKEND_API_URL` to the Spring Boot HTTPS production URL.
2. Replace `https://SPRING_BOOT_PRODUCTION_HOST/*` in `manifest.production.example.json` with the same production host.
3. Use the production manifest content for the packaged `manifest.json`.
4. Do not include `http://localhost:8080/*` or `http://127.0.0.1:8080/*` in the production manifest.
5. Keep ChatGPT, Gemini, and Claude host permissions while Execute is supported.
6. Build the production package with `VITE_BACKEND_API_URL` set, then run `npm run build:prod`.

Production builds fail fast when `VITE_BACKEND_API_URL` is missing, so a package with an empty Backend API URL is not created by mistake.

## Production Extension ID

The production Extension ID is not known until the extension is registered in Chrome Web Store.
After registration, share the origin below with the backend team so Spring Boot can allow it in CORS/security settings:

```text
chrome-extension://{productionExtensionId}
```

Unpacked local development extension IDs can differ by machine, so they should not be used as production allowlist values.
