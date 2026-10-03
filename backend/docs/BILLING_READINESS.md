# Billing readiness follow-up to PR #27

This change is based on `817308a` (`trytur/member-token-usage`). It does not
deploy or merge PR #27. Review it with that PR before integrating into develop.

## First-payment recovery

- Registered cards with automatic renewal enabled and no `nextChargeAt` are
  included in the billing poll. This covers a crash after saving the billing key
  and an uncertain first-payment response.
- Existing PENDING orders are looked up before charging. Retries retain the
  original order ID and provider idempotency key.
- Declined payments disable renewal; polling does not automatically retry them.
- A stopped renewal retains its already-paid PRO period until expiration.

`GET /api/me/billing` keeps its existing fields and adds `paymentStatus`:

| Value | Meaning |
| --- | --- |
| NOT_REGISTERED | No registered billing key |
| PENDING | An unresolved order, or a registered card awaiting its first payment |
| ACTIVE | Paid period has not expired (even if renewal is stopped) |
| FAILED | No active period and a declined payment exists |
| EXPIRED | Last paid period has ended |

An unresolved renewal can report PENDING while the current paid period is still
active. `/api/me/usage.plan` remains the entitlement source; `paymentStatus` is
the payment lifecycle, not a replacement for that field.

## Remaining integration work

- Frontend: show PENDING and re-fetch billing plus usage after an uncertain
  result. Do not interpret card registration or autoRenew as successful payment.
- Timeout: each provider call currently permits 70 seconds; `/complete` can
  perform card issuance + charge, or lookup + charge, sequentially (up to
  140 seconds in the normal flow). The web
  timeout is 90 seconds and the staging nginx default is also 90 seconds.
  Agree on a bounded server budget or asynchronous completion, then align
  browser and proxy timeouts. Increasing only the browser timeout is insufficient.
- AI: return actual token counts and agree on a stable per-request identifier.
  MemberTokenUsageService currently has no call site in the improve flow.
- Policy: FREE/PRO token limits and over-limit behavior are not defined in #27.
  Do not expose fabricated remaining tokens or claim limits are enforced.
- Deployment: merge the guest policy and server configuration with billing
  before switching Railway to the integrated develop branch. Configure only
  Toss test keys for this demonstration and verify the web redirect origin.

Tests cover uncertain first-payment lookup, recovery before any order exists,
one charge per order, explicit decline/retry, renewal, and expiration.
