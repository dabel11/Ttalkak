# Authentication ingress: current review contract

This document describes the final implementation. The dated independent-review
and security-gate files retain historical reproductions, including implementations
that were subsequently removed. Code review readiness is separate from rollout approval.

## Request flow and failure behavior

1. Only the eight sensitive authentication POST routes are limited. OPTIONS and
   other routes retain their existing handling. The original container-decoded
   servlet path/path info selects the same route as MVC, including encoded letters
   and servlet mapping prefixes. ForwardedHeaderFilter wrappers cannot change it.
2. Without an authenticated internal proxy, optional mode uses the socket peer.
   Strict mode returns 503 AUTH_PROXY_REQUIRED before controller dispatch.
3. A valid internal secret and single canonical IP header identify a proxy client.
   IPv4 and mapped IPv6 share an identity. Duplicate/combined headers cannot attest
   a client. Spring native forwarding, implicit strategy, and explicit Tomcat
   remote-IP/protocol headers are rejected at startup; explicit none/framework work.
4. The Spring-managed filter always uses SharedAuthRequestLimiter. No local quota
   is granted when the shared store fails: return 503 AUTH_RATE_LIMIT_UNAVAILABLE,
   Retry-After 5, before account lookup, password work, or mail dispatch. Quota
   exhaustion remains 429 AUTH_RATE_LIMITED with Retry-After 60.

## Shared exact sliding log

The count-min sketch has been removed from application wiring. An InnoDB row per
HMAC(IP, route) stores at most 10/30 accepted timestamps. Atomic upsert + row lock
serializes first and subsequent requests across replicas. A separate transaction
commits attempts even when downstream work rolls back. Denials do not extend or
increase the log. DB time, sampled after the row lock, selects exactly the previous
60,000ms, with no 5-second quantization. Reconstructing an application instance
with the same DB and JWT key does not restore its allowance.

The existing JWT secret supplies a domain-separated HMAC key; raw IPs are not
persisted. All replicas must already share this stable key for JWT verification.
Intentional key rotation changes limiter identities and must be considered during
rollout; routine restart does not. The isolated TestAuthRateLimitFilter exists only under test sources and is never
packaged in the application. Production has no in-memory limiter or fallback.

Each state row holds at most thirty timestamps (VARCHAR 1024). Indexed cleanup
removes up to 500 logically expired rows every five seconds per running instance.
An expired row can be safely reused before physical cleanup. There is no sketch
collision, live-key eviction, 10,000-key cap, or shared overflow bucket. This is not
a guarantee against unbounded volumetric traffic or database resource exhaustion:
retain edge admission controls, capacity monitoring, and DB connection limits.
The new auth store adds a DB transaction to each sensitive authentication request;
actual traffic sizing is a rollout check, not a CI performance claim.

## Schema and rollout

- New additive table: auth_rate_limit_state, with expiry index. No existing account,
  payment, or authentication-token rows are migrated or deleted.
- Schema-managed environments must review and apply
  [the migration](sql/20261028_auth_rate_limit_state.sql) before code starts in
  ddl-auto=validate mode. Disposable MySQL 9 update->validate rehearsal verifies
  generated schema compatibility; it does not certify the existing Railway schema.
- A rollback can leave this auxiliary table in place. Do not drop it during normal
  rollback, or restore the previous vulnerable implementation as a safety measure.
- Existing MySQL is the only shared-store dependency; no Redis, new Railway service,
  new operational variable, or production write is performed by this review task.

## Verification

- Shared-store tests: two concurrent instances, replacement instance, exact cutoff,
  rejected traffic, downstream transaction rollback, >10,000 distinct identities,
  independent identities/routes, expired-only cleanup, and database clock path.
- Explicitly gated disposable MySQL test validates real InnoDB locking and epoch
  clock across separate limiter instances. H2 tests are not its substitute.
- Filter test proves shared-store failure never dispatches or falls back locally.
- Disposable nginx/Spring smoke exhausts an attested quota, restarts the actual
  backend process, and verifies 429 persists. The restart must finish within the
  60-second observation window; a slow restart is an inconclusive timing failure.
- A real Tomcat probe checks encoded route letters and servlet mapping prefixes
  cannot bypass strict enforcement. nginx/Spring alternates encoded and plain
  routes to verify a shared quota and rejects both on untrusted direct ingress.
- Existing prefix, forged/duplicate header, strict, mapped-IP and native-Tomcat
  regressions remain. Disposable nginx/Spring and browser checks must pass at the
  exact current PR HEAD; the PR body records the final run IDs and result.

## Rollout gates, not claims of completed production integration

No installed extension bundle or external-consumer inventory is available in the
repository. Verify they use web ingress before strict activation or backend domain
removal. Removing that domain would also interrupt unrelated direct API calls.
Railway public-edge X-Real-IP rewriting and private/TCP nginx isolation require
actual platform evidence: a shared nginx secret cannot establish the truth of
an attacker-supplied IP reaching nginx on an untrusted private path. Verify actual
Dockerfile/upstream/forwarding/CORS/Google-origin settings and schema before rollout.
These are explicitly blocked deployment actions; passing disposable CI does not
supply the missing evidence. Optional mode still pools users sharing a socket peer
or NAT, by definition of IP rate limiting. Strict activation is not performed here.
