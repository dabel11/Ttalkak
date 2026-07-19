# TTALKAK Chrome Extension Release Checklist

This checklist tracks the frontend-side work needed before publishing the TTALKAK Chrome Extension and sharing the production extension origin with the backend team.

## Current Status

- Development backend default: `http://localhost:8080`
- Production backend default: configured only through `VITE_BACKEND_API_URL`
- Production manifest template: `manifest.production.example.json`
- Development manifest: `public/manifest.json`
- Production extension ID: not available until the extension is registered in Chrome Web Store
- Spring Boot production URL: pending backend/infrastructure confirmation

## Frontend Items Already Prepared

- `VITE_BACKEND_API_URL` is the single source for the Backend API URL.
- Production builds fail when `VITE_BACKEND_API_URL` is missing or still uses the placeholder host.
- `npm run build:prod` uses `manifest.production.example.json`.
- Production manifest host permission is generated from `VITE_BACKEND_API_URL`.
- Development-only localhost host permissions remain in `public/manifest.json`.
- ChatGPT, Gemini, and Claude host permissions remain because Execute uses them.

## Before Chrome Web Store Upload

1. Confirm the Spring Boot production HTTPS URL.
   - Example: `https://api.ttalkak.com`
   - This value must not include a trailing slash.

2. Set the production environment variable.

```bash
VITE_BACKEND_API_URL=https://SPRING_BOOT_PRODUCTION_HOST
```

3. Build the production package.

```bash
npm run build:prod
```

4. Inspect `dist/manifest.json`.
   - It must include the production Spring Boot host permission.
   - It must not include `http://localhost:8080/*`.
   - It must not include `http://127.0.0.1:8080/*`.

5. Verify store listing assets.
   - Extension name: `Ttalkak`
   - Short description
   - Detailed description
   - Icon assets required by Chrome Web Store
   - Screenshots
   - Privacy practices text

6. Upload the `dist` package to Chrome Web Store.

7. After registration, copy the production Extension ID.

8. Share the production extension origin with backend.

```text
chrome-extension://{productionExtensionId}
```

## Backend Handoff After Extension ID Is Known

Send this to the backend team:

```text
The production Chrome Extension ID has been confirmed.

Please allow the following origin in Spring Boot CORS/security settings:

chrome-extension://{productionExtensionId}

Development unpacked extension IDs may differ by local machine, so they should not be used as production allowlist values.
```

## Production Smoke Test

After backend CORS is updated, verify these flows from the installed production extension:

- Login with Spring Boot `POST /api/auth/login`
- Prompt improve with `POST /api/prompts/improve`
- Guest prompt improve with persistent `X-Session-UUID`
- Saved prompt list load
- Save prompt
- Delete saved prompt
- Recent Make thread list load
- Execute to ChatGPT/Gemini/Claude
- `401` clears session and asks for login
- `FREE_TRIAL_LIMIT_EXCEEDED` prompts login
- `AI_TIMEOUT` and `AI_SERVICE_UNAVAILABLE` show retry/service unavailable guidance

## Still Blocked By External Values

- Spring Boot production HTTPS URL
- Chrome Web Store production Extension ID
- Backend CORS allowlist update for `chrome-extension://{productionExtensionId}`
