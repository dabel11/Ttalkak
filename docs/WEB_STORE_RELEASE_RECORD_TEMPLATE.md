# Chrome Web Store Release Record

Copy this file to `docs/release-results/YYYY-MM-DD-extension-vX.Y.Z.md` for a release candidate. Do not record credentials, tokens, private keys, prompts, conversations, or test-account personal data.

## Build evidence

- Commit SHA:
- GitHub Actions URL:
- Successful jobs:
- Production API origin:
- Chrome Web Store Extension ID:
- Package SHA-256:
- Rollback package/version:

## Ownership

- Release owner:
- Smoke tester:
- Test date and Chrome version:

## Smoke result

- [ ] Side panel and backend connection
- [ ] Guest improve and ask follow-up
- [ ] Login, session restore, logout, authentication expiry
- [ ] Cancellation, immediate resend, and timeout distinction
- [ ] Edited resend for guest and signed-in threads
- [ ] Copy, Save, Recents, and Execute visibility
- [ ] ChatGPT and Gemini insertion; Claude clipboard fallback
- [ ] `no_evidence` and unchanged-result guidance
- [ ] AI unavailable, rate limit, invalid response, and network recovery
- [ ] Side-panel close aborts the active request

## Notes

Record only pass/fail, environment identifiers, and content-free diagnostics.
