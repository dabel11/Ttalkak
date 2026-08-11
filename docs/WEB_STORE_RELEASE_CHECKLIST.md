# Chrome Web Store Release Checklist

Use this checklist for the production Extension only. The unpacked `dist-dev` Extension and its fixed development ID are not production release evidence.

## Configuration

- [ ] Production HTTPS Spring Boot API URL is confirmed.
- [ ] Chrome Web Store Extension ID is recorded in `FRONTEND_OPERATING_POLICIES.md`.
- [ ] Backend CORS allows the exact production `chrome-extension://...` origin.
- [ ] CORS preflight permits required methods, `content-type`, `authorization`, and credentials.
- [ ] Public privacy policy URL works without authentication.
- [ ] Public support URL and monitored contact channel are available.
- [ ] No credential, private key, token, or local `.env` file is packaged.

## Build and package

- [ ] Run `npm ci` in `extension`.
- [ ] Run `npm run verify`.
- [ ] Build with the confirmed production URL: PowerShell: `$env:VITE_BACKEND_API_URL='https://...'; npm run build:prod`; POSIX: `VITE_BACKEND_API_URL=https://... npm run build:prod`.
- [ ] Package only `extension/dist-prod`.
- [ ] Confirm `dist-prod/manifest.json` contains no development public key.
- [ ] Confirm production host permissions contain no localhost, loopback, example, `.test`, or `.invalid` host.
- [ ] Confirm `dist-verify` remains non-installable and is not packaged.

## Permission audit

Current permissions and their release rationale:

| Permission | Current use | Removal condition |
| --- | --- | --- |
| `sidePanel` | Hosts the Extension UI | Remove only if the product surface changes |
| `scripting` | Primary prompt insertion on supported AI sites | Remove if Execute no longer inserts into pages |
| `activeTab` | User-initiated access to the active supported AI tab | Reassess with `tabs` during every store release |
| `tabs` | Finds and activates supported ChatGPT/Gemini tabs | Remove if Execute is limited to the active tab |
| `clipboardWrite` | Explicit copy and Claude fallback | Remove if both features stop writing clipboard data |
| `debugger` | Last-resort ChatGPT/Gemini text insertion | Remove after DOM-only insertion is verified reliable |
| `storage` | Auth session, guest UUID, saved prompts, and recent threads | Remove only with a replacement persistence design |

- [ ] `npm test` permission allowlist passes.
- [ ] No `<all_urls>` or unsupported host permission exists.
- [ ] Debugger fallback remains restricted to supported ChatGPT/Gemini origins and always detaches.
- [ ] Clipboard writes occur only after a user action.
- [ ] Store disclosure explains every retained permission.

## Production smoke

- [ ] Side panel opens and reports backend connection correctly.
- [ ] Guest improve and ask-follow-up flows work.
- [ ] Login, session restore, logout, and authentication expiry work.
- [ ] Improve timeout is distinct from user cancellation.
- [ ] Cancellation restores input and ignores late responses.
- [ ] Edited resend works for guest and logged-in threads.
- [ ] Copy, Save, Recents, and Execute follow their visibility rules.
- [ ] ChatGPT and Gemini insertion work; Claude clipboard fallback is explicit.
- [ ] `no_evidence` is a successful fallback, not a red error.
- [ ] AI unavailable, rate limit, invalid response, and network errors show the correct recovery action.
- [ ] Closing the side panel aborts an active request.

## Release record

- [ ] Commit SHA recorded.
- [ ] CI URL and successful jobs recorded.
- [ ] Store package checksum recorded.
- [ ] Release owner and smoke tester recorded.
- [ ] Rollback package/version identified.
