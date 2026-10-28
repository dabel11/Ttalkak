# PR #81: concrete merge and deployment procedure

Scope: prepare and verify a compatible first deployment. Strict proxy activation,
backend domain removal, client migration, real email tests and payment operations
are excluded. Execution still needs the user's final approval; this document and
its plan JSON do not alter Railway. The candidate SHA must be pinned at approval.

## Observed baseline and deterministic target

Railway web/backend currently report live commit `95c1f1c` (PR #82), with one sfo
replica each and no public TCP proxies. PR #81 incorporated that develop commit
without overwriting its email-ID recovery changes. Deployment and snapshot IDs,
service IDs and exact proposed non-secret values are in
[AUTH_RELEASE_PLAN.json](release/AUTH_RELEASE_PLAN.json).

The first release preserves both public domains and every existing client base
URL. Proxy secret remains empty and strict mode false. Untrusted forwarded IPs
are never accepted as limiter identities in this phase; edge X-Real-IP isolation
is therefore a prerequisite for a later trust activation, not a reason to block
this compatible release. Optional mode still pools clients sharing an edge peer
or NAT; it is not a real-client-IP guarantee. No secret is generated or rotated.

Set backend forwarding to framework explicitly: native/implicit forwarding is
unsupported. Set fixed known HTTP ports and the web's reference to the backend's
Railway-provided private domain. Leave CORS, Google, mail, billing, DB credentials,
JWT secret and account passwords untouched. Turn off admin/review startup seeders
so existing test accounts are not recreated or resynchronized during rollout.

## Evidence required before execution approval

- Exact candidate's full CI and server container workflow must succeed, including
  the new observed-live upgrade job, plus all prior strict/encoded/restart tests.
- The upgrade job builds the observed live backend AND web from the pinned live
  commit, creates ordinary/admin/review fixtures only in its fresh disposable
  MySQL, and captures canonical SQL row digests. It replaces only the backend,
  verifies all legacy table data and JWTs survive, exercises the old web and direct
  API route, and rehearses the old backend with forwarding disabled against the
  migrated database. Its temporary compose resources are always removed.
- Successful new backend startup requires the expected expiry index, schema,
  DB clock, INSERT/SELECT/UPDATE/DELETE privileges, and a fully rolled-back reserved
  probe transaction. No probe state or account change is committed. A failing
  store prevents the application becoming healthy, instead of giving a green
  healthcheck followed by broken logins. JWT decoding uses the same decoder as
  the existing JWT service.
- Existing live read-only baseline: health/tags/auth config 200, six protected
  anonymous GETs 401, untrusted website/Chrome extension preflights 403. No auth
  POST, mail, account creation or production database mutation was used.

## Approved execution sequence

1. Re-read current develop SHA, both live deployment IDs, both service configs and
   pending environment changes. Stop on drift from the observed baseline or any
   unrelated pending patch. Confirm the approved exact candidate still contains
   current develop and all checks are green. Record current configuration and
   deployment/snapshot IDs for recovery without printing credential values.
2. After approval, stage only the two listed services' plan values and healthcheck
   settings. Read the staged patch back; reject unrelated/destructive changes.
   Commit the patch, which can restart the current-version services. Wait for both
   terminal SUCCESS and repeat read-only HTTP checks BEFORE merging code. Stop if
   configuration-only rollout fails. No MySQL service/volume is changed.
3. Merge the approved PR into develop. Both services follow develop and may deploy
   automatically; record the actual resulting merge commit, not just the PR SHA.
   Do not start duplicate deployments. Follow both deployments to terminal SUCCESS
   and verify both runtime commit hashes equal that merge commit.
4. On startup, JPA update adds only auth_rate_limit_state and its expiry index.
   The reserved store validation transaction is rolled back. Existing account,
   password, token, conversation and billing rows are not migration targets.
   Read the two sanitized startup markers from the NEW backend deployment. Expected:
   FRAMEWORK, strict=false, proxy_attestation=false, store/index/probe success.
   Never treat a queued deployment or HTTP 200 alone as completion.
5. Run the existing read-only HTTP/security checker again. If separately included
   in the approval, send at most the two specified nonexistent find-ID probes;
   these consume auxiliary quota only and must return 200 with an empty masked ID.
   Do not log in using uncertain credentials, create accounts, send email, run AI
   generation, mutate billing, or exhaust production quota as a smoke test.
6. Record deployed merge commit, service deployment IDs, terminal states, sanitized
   startup results and HTTP results. Only then mark this first deployment complete.

## First transition and recovery

The old release has volatile counters. It cannot participate in the new shared
log, and its history cannot be reconstructed from the DB. This first compatible
release explicitly starts the shared history at cutover: there is a one-time
legacy quota reset, not a claim that old attempts were imported. New-version
replicas/restarts share state after transition. Overlap/draining settings prevent
old replicas from continuing as a second active quota pool. If zero-reset continuity
across the old/new boundary is required instead, a supervised 60-second auth quiet
period must be enforced before new auth work; that stronger guarantee is not
silently claimed by this release. This transient counter policy is included in
the execution approval, not represented as account/session loss.

If a new build/startup/store check fails, healthcheck gating must keep the previous
healthy deployment serving. Stop before additional changes. Never delete the new
auxiliary table or restore a backup over the existing database as normal rollback.
The rehearsed old-version fallback requires forwarding=none (framework on the old
filter trusts forwarded client IP). Inspect actual effective values when selecting
any old deployment: selecting a historical build does not justify assuming current
configuration was preserved. Prefer a corrected candidate/roll-forward while auth
fails closed; do not restore known vulnerable settings as a shortcut. Previous
Railway deployment/snapshot IDs remain available for controlled recovery.

## Later strict activation

Strict activation still requires installed/external client inventory and actual
public-edge/private-ingress evidence. It is a separate change with its own approval;
this first release does not enable that unverified trust boundary. Neither an
installed extension upload nor manual account/password work is needed from the
user to prepare the compatible first deployment described here.
