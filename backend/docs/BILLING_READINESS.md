# Billing readiness

Billing and timeout changes are integrated in develop through the merged billing PRs.
Actual provider approval and deployment configuration must still be verified.

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
- Timeout: provider calls default to 20 seconds each and share a 60-second
  monotonic deadline across card issuance, lookup, and charge within one
  `/complete` or retry request. Polling starts a fresh budget for each member.
  Database time before subsequent provider calls consumes the same budget;
  database operations themselves are not forcibly cancelled by this deadline.
  `BILLING_PROVIDER_TIMEOUT` and `BILLING_REQUEST_BUDGET` configure these values.
  The request budget must be positive and at most 75 seconds, leaving room
  beneath the current 90-second browser/nginx timeout. Do not claim this is a
  hard end-to-end deadline for stalled database operations.
- Provider timeout, network failure, HTTP 408/429, or 5xx during payment keeps
  the order PENDING and returns BILLING_UNCERTAIN; it does not mark the card as
  declined or create a replacement order. Card issuance timeout/network failure
  returns BILLING_CARD_REGISTRATION_UNCERTAIN. A missing billing key cannot be
  recovered by the existing payment-order poll: check status and resolve the
  card registration before retrying.
- AI: return actual token counts and agree on a stable per-request identifier.
  PR #32 records valid usage from successful member improve requests.
- Policy: configurable member quotas are prepared in MEMBER_QUOTA.md, disabled
  by default. Set team-approved FREE/PRO limits only after real usage verification.
- Deployment: confirm Railway actually runs the integrated develop commit. Configure only
  Toss test keys for this demonstration and verify the web redirect origin.

Tests cover uncertain first-payment lookup, recovery before any order exists,
one charge per order, explicit decline/retry, renewal, and expiration.
