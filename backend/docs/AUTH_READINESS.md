# Authentication backend — implementation and staging handoff

## Implemented server contract

All paths below start with `/api/auth`. JSON requests use `Content-Type: application/json`. Protected calls use the application's `Authorization: Bearer <accessToken>`; never use a Google ID token as the application JWT.

| Method / path | Input | Result |
| --- | --- | --- |
| GET `/config` | None | `googleLoginEnabled`, public `googleClientId`, `passwordResetEnabled` |
| POST `/signup` | Existing signup fields + both consent flags | Application JWT and `user.provider=local`; validates ID, profile/email fields, password and birth date |
| POST `/login` | `userId`, `password` | Application JWT and local member profile |
| POST `/google` | `credential`; first registration also requires `agreeTerms=true`, `agreePrivacy=true` | Application JWT, Google profile and `newMember`; missing first-registration consent returns `AUTH_TERMS_REQUIRED` |
| GET `/me` | Application JWT | Authoritative member profile including provider; invalid/expired/revoked JWT returns 401 |
| POST `/logout` | Application JWT | Revokes this token only, `scope=current_session` |
| POST `/logout-all` | Application JWT | Invalidates all member tokens, `scope=all_sessions` |
| POST `/password/change` | JWT + `currentPassword`, `newPassword`, `passwordConfirm` | Local accounts only; invalidates all sessions; `loginRequired=true` |
| POST `/password-reset/request` | `userId`, `email` | Generic acknowledgement; queued mail only when a matching active local account exists |
| POST `/password-reset/complete` | `token`, `newPassword`, `passwordConfirm` | Consumes one valid code and changes password; invalidates all sessions; requires fresh login |
| POST `/id-recovery/request` | `name`, `email` | Generic acknowledgement; actual local IDs are mailed only to the registered address |
| DELETE `/withdraw` | JWT + local `password` or Google `credential` | Existing withdrawal flow; withdrawn JWTs are rejected |

`/find-id` remains compatible with the existing masked-ID UI; new account recovery should use `/id-recovery/request`. The phone field in old recovery requests does not establish identity.

## Security and behavior

- Recovery codes contain 256 random bits, expire after 15 minutes, and are stored only as SHA-256 hashes. A member row lock serializes resend/completion; successful consumption prevents replay. Resends within 60 seconds preserve the first code.
- SMTP errors roll back code issuance and do not expose recipient, code or transport exception contents. Background mail acknowledgement does not prove delivery. The bounded in-memory queue is not durable across a restart; retry delivery requests if no mail arrives.
- Missing accounts, mismatched email, blocked members and Google accounts do not receive local password reset mail. Requests return the same acknowledgement without synchronous SMTP/account lookup timing.
- JWTs have unique `jti`, expiration and member `authVersion`. Legacy tokens lacking `authVersion` are accepted only while the member version is zero. Password changes/reset and logout-all increment this version. Individual logout stores only a token hash until expiration; hourly cleanup removes expired revocations.
- Member optimistic locking prevents stale profile updates from restoring an old authentication version.
- Google signature, issuer (both Google issuer forms), audience, authorized party, verified email, subject and token lifetime are checked. Google JWK network calls have 5-second connect/read timeouts. Existing local and Google accounts are not automatically linked by matching email.
- New Google members require explicit consent. Existing Google members can log in without repeating consent. If first login returns `AUTH_TERMS_REQUIRED`, show terms/privacy consent and obtain a fresh Google credential to retry.
- Auth POST endpoints have bounded per-process/IP/path limits: recovery 10/minute; login/signup/Google/password-change 30/minute. Returns 429 `AUTH_RATE_LIMITED` and `Retry-After: 60`. The filter runs inside Spring Security after CORS. This is a staging safeguard, not a distributed gateway rate limiter.
- Access tokens expire after `JWT_EXPIRATION_MINUTES` (default 120). This release intentionally requires login again after expiration; it does not implement refresh tokens or silently extend sessions.
- Passwords are literal values: do not trim them. Minimum 8 characters, maximum 72 UTF-8 bytes (BCrypt limit). Invalid dates/fields return 400; concurrent data conflicts return 409.

## Railway / Google setup

1. Configure the team's Google Cloud consent screen and Web application OAuth Client ID. If in testing mode, add consenting test users.
2. Set Authorized JavaScript origin to `https://web-production-a82d94.up.railway.app` (no path/trailing slash). Set backend Railway `GOOGLE_CLIENT_ID` to the same Web Client ID. This GIS popup/callback design needs no new Spring redirect endpoint or Client Secret.
3. Railway Free/Trial/Hobby blocks outbound SMTP. Use Resend over HTTPS as described below. SMTP is an option only when the hosting plan permits it; provision an SMTP service and verified sender. Set Railway variables `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `AUTH_MAIL_FROM`, `PASSWORD_RESET_ENABLED=true`. STARTTLS is mandatory; connect/read/write waits are bounded to 5 seconds. Use the provider's actual port/configuration and confirm that the Railway plan permits its SMTP egress; do not disable TLS to fix delivery.
4. Leave recovery disabled until SMTP is available. Without complete host/from/sender configuration, requests return 503 `PASSWORD_RESET_UNAVAILABLE`; no false delivery success is returned.
5. Preserve MySQL and the stable JWT secret. With this project's `JPA_DDL_AUTO=update`, rollout adds `member.auth_version`, `member.entity_version` (zero defaults), `password_reset_token` and `revoked_auth_token`. For schema-managed environments, apply equivalent additive migrations before deployment. Back up staging data before changing schema policy.
6. Keep backend/web deployments on `develop` after review/CI/merge. Check `/api/auth/config` through the web nginx proxy. Enabled flags describe configuration, not successful Google/SMTP integration.
7. For Railway's trusted reverse proxy, configure forwarded-header handling appropriately (`FORWARD_HEADERS_STRATEGY=framework`); confirm distinct real clients have distinct remote addresses before relying on IP rate limiting. Do not accept client-supplied forwarding headers through an untrusted direct deployment.

Official setup references:
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://docs.spring.io/spring-boot/3.5/reference/io/email.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

## Frontend owner — required integration

1. Fetch `/config`, render GIS's sign-in button using `googleClientId`, handle its fresh credential callback and POST `/google`. Remove demo fallback, including the API failure fall-through. Preserve first-registration consent and provider in normalized session state.
2. Local/Google login must share post-login Make/history hydration. Clear credentials/drafts when closing auth and on success/logout; do not store password or Google credential in persistent/global configuration.
3. On reload, validate stored application JWT with `/me`; on 401 clear member state and request login while preserving pending guest transfer as already designed. Display blocked-account errors. Google credential is not a Railway variable.
4. Logout: call `/logout` before clearing the local token, then clear member state even if it is already expired. If the revocation call fails for a network reason, explain that only local logout is confirmed and retain an explicit retry path without keeping the user falsely signed in. Logout-all is a separately labelled action.
5. Recovery UI: request email, show generic acknowledgement, accept emailed reset code + new password/confirmation, POST `/password-reset/complete`, clear session and return to login. Do not automatically log in after reset. For ID recovery use `/id-recovery/request` and show generic email guidance. Disable recovery when configuration is false.
6. Account password change requires the old password, then clears all local auth state on success. Google accounts use Google's password management rather than a local password form.
7. Withdrawal branches on provider: local password versus fresh same-account Google credential. Do not auto-close the form on failed reauthentication.
8. Show actionable 400/401/403/409/429/503 errors, disable repeat submissions while pending, and preserve entered non-secret fields on errors. Do not reintroduce demo identities when any request fails.

## Verification status / release gates

Added tests cover reset hash storage, one-use/expiry/replay, resend cooldown, concurrent consumption, wrong-email/Google isolation, SMTP rollback, password rules, password change, JWT expiry, session restoration, individual/all-device logout, recovery configuration and rate limits. Existing provider/withdrawal tests remain.

Local Java syntax/patch checks and existing frontend authentication tests can run here. Full Gradle/JUnit execution is blocked by this execution environment's dependency-network access; the PR's Backend tests must pass before merge. No successful local Java test run is claimed.

After deployment, use a consenting test account and disposable staging data: real Google signup/login/withdrawal; email request/receipt/reset/replay/expiry; old-password rejection; old-JWT rejection; individual logout without logging out another session; all-device logout; refresh and expired-token UI; blocked/withdrawn account rejection; guest-to-member history transfer. Configuration changes and real delivery/Google success have not yet been verified.


## Resend HTTPS mail delivery

No SDK or additional dependencies are required. `AUTH_MAIL_TRANSPORT=resend` uses
`https://api.resend.com/emails` with a backend-only bearer key and a plain-text body.
Connection/read timeouts are 5 seconds; there are no automatic retries. HTTP success
requires a nonempty delivery ID; provider/network errors are sanitized and reset-code
issuance rolls back as in SMTP. Provider acceptance is not proof of inbox delivery.

### Domain-free staging test

Set these variables on the **backend** Railway service after this change is merged:

```text
AUTH_MAIL_TRANSPORT=resend
RESEND_API_KEY=<sending-access key, never commit>
AUTH_MAIL_FROM=onboarding@resend.dev
AUTH_MAIL_TEST_RECIPIENT=<email associated with the Resend account>
PASSWORD_RESET_ENABLED=true
```

The test account's registered email must match `AUTH_MAIL_TEST_RECIPIENT`.
Only that registered recipient is permitted; another user's recovery credentials are
never redirected to the tester. The shared `resend.dev` sender cannot advertise recovery
without a test recipient. The public enabled flag indicates configuration readiness,
not availability to every user or proven delivery. Keep public recovery UI disabled
until a verified sender domain is ready. The generic queued acknowledgement remains
the same regardless of account existence; check Resend's delivery status and inbox
without sharing the reset code or API key.

### Public service

Verify a domain you own in Resend (DNS access required). Railway's shared app domain
is not an owned sending domain. Change `AUTH_MAIL_FROM` to an address on the verified
domain and remove `AUTH_MAIL_TEST_RECIPIENT` to allow registered recipients normally.
Do not enable public account recovery on the shared sender. SMTP remains the default
for existing installations; unknown transport names disable recovery.

References:
- https://docs.railway.com/networking/outbound-networking
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
