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

Keep backend forwarding at explicit `none` while any old-version backend can serve
requests. Only AFTER the new version is serving and verified with `none`, switch to
explicit `framework` in a separate configuration rollout. Native/implicit forwarding
is unsupported. Set fixed known HTTP ports and the web's reference to the backend's
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

**Security invariant:** never run the old auth limiter with
`FORWARD_HEADERS_STRATEGY=framework`. The old filter can trust forged forwarded
IP headers in that configuration. A deploy or rollback that could start old code
must have effective forwarding `none` **before** old code can serve traffic.
Do not make the final `framework` value part of any pre-merge variable patch.

1. Re-read current develop SHA, live deployment IDs, service configs, effective
   forwarding strategy, and staged Railway patches. Stop on drift, unexpected
   settings or unrelated pending changes. Verify the old backend's *effective*
   strategy is `none` before any rollout; if it is not, stop and safely restore
   `none` before proceeding. Capture sanitized snapshots and the candidate
   SHA without printing secrets.
2. PRE-MERGE SAFE CONFIG: stage only the listed compatible non-forwarding service
   variables/healthcheck settings and keep/explicitly set backend
   `FORWARD_HEADERS_STRATEGY=none`. Read back the patch and reject any
   `framework`/native value or unrelated change. Commit, let the old release
   settle at terminal SUCCESS, and repeat read-only health/security checks.
   Do not touch the MySQL service, volumes, JWT or credentials.
3. Merge the approved candidate into develop. Follow both automatic deployments
   to terminal SUCCESS. Pin and verify the actual merge SHA for both running
   services. The NEW backend must initially start with `none`; do not assume
   a queued deploy, HTTP 200 or the old image constitutes success.
4. Verify NEW-backend startup markers under `NONE`, including schema, expiry
   index and rolled-back write probe, and re-run read-only HTTP/security checks
   on both web and direct API. Confirm old backend replicas are drained and can
   no longer serve traffic. On failure, stop; do not switch to `framework`.
5. POST-CODE CONFIG: only now stage the backend-only
   `FORWARD_HEADERS_STRATEGY=framework` setting; confirm the deployment is using
   the verified NEW merge SHA, no rollback or old replica is active, and no
   unrelated patch is pending. Commit the setting, wait for terminal SUCCESS,
   and verify effective `FRAMEWORK` startup marker, strict=false,
   proxy_attestation=false, plus healthy shared store.
6. Re-run the read-only HTTP/security checks after the switch. If independently
   approved, run at most the two specified nonexistent find-ID probes (only
   auxiliary quota writes, empty masked ID). Do not create accounts, send mail,
   log in with uncertain passwords, mutate billing or exhaust live quotas.
7. Record both transition deployment IDs, actual SHA, effective configurations,
   sanitized startup markers and results. Complete only after both phases pass.

## Expected sanitized startup markers by phase

- Old-version pre-merge: effective forwarding `none`; do NOT expect the new
  `AUTH_INGRESS_CONFIG` or shared-store marker from old code.
- New backend before setting switch: `AUTH_INGRESS_CONFIG strategy=NONE strict=false proxy_attestation=false`
  and `AUTH_RATE_LIMIT_STORE_READY schema=true expiry_index=true write_probe=rolled_back`.
- New backend after switch: `AUTH_INGRESS_CONFIG strategy=FRAMEWORK strict=false proxy_attestation=false`
  and `AUTH_RATE_LIMIT_STORE_READY schema=true expiry_index=true write_probe=rolled_back`.
- Reject native/implicit or Tomcat remoteip header overrides in every phase.
  Verify these markers in the deployment running the pinned merge SHA, not
  merely in historical logs.

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
filter trusts forged forwarded client IP). **Before** selecting or enabling any old
image, stage/confirm effective `none` and verify it, then perform the old-image
rollback. If already in the post-code `framework` phase, first revert forwarding
to `none` while NEW code is still serving, verify that setting, and only then
activate the old image. Never activate the old image with `framework`, even
momentarily. Inspect effective values after every rollback; historical deployment
selection alone does not restore previous environment variables. If safe ordered
rollback cannot be established, keep the new version fail-closed and escalate
rather than serving known-vulnerable old code. Do not delete the auxiliary table,
roll back the production DB, or rotate credentials as ordinary recovery. Previous
Railway deployment/snapshot IDs remain available for controlled recovery.

## Later strict activation

Strict activation still requires installed/external client inventory and actual
public-edge/private-ingress evidence. It is a separate change with its own approval;
this first release does not enable that unverified trust boundary. Neither an
installed extension upload nor manual account/password work is needed from the
user to prepare the compatible first deployment described here.
