# PR #81 independent authentication ingress review — 2026-10-28 KST

Status: Draft; release blocked. No deployment, merge, production variable/domain/DB changes or live email requests.

## Commit evidence

- Review baseline: `dd72ee05d42b226ddf8ad409f446a82b06abee59` (not historical `7886b08`). CI #619 / run 40524566247: six jobs succeeded. Server container smoke #348 / run 40524566252 succeeded, including strict nginx/Spring attestation step and PASS log.
- Existing tests cover untrusted XFF after ForwardedHeaderFilter, valid proxy identity separation, invalid/duplicate attestation, IPv6 normalization, strict startup and POST rejection, concurrent identity churn and bucket boundaries. These do not prove Railway public-edge sanitation or private-ingress isolation.
- Review regression commit `2db1e4c`: strict endpoint/preflight matrix and a previously absent X-Forwarded-Prefix check. CI #620 backend job 122423074402 reproduced a failure in `forwardedPrefixMustNotBypassStrictAuthenticationGate`: 298 tests, 1 failed. The original filter skipped its strict check after Spring rewrote the URI. This is a filter-chain reproduction, not a claim that production accounts were attacked.
- Local Gradle could not download Gradle 8.14.5 due to network restrictions; Docker is not installed. Do not report local Java/container tests as passed.

## Verified routing inventory

Railway read-only inventory: project ttalkak-staging; environment production. Both web and backend follow `develop` with one sfo replica, and have distinct public domains. Current PR branch is not their deployment source. No staged config changes were reported.

| Client | Repository routing | Compatibility gate |
| --- | --- | --- |
| Web Docker build | `docker/web.Dockerfile` injects `window.TTALKAK_API_BASE_URL = window.location.origin`; core API appends `/api/auth/...`; nginx `/api/` forwards to BACKEND_UPSTREAM | Verify actual deployed Dockerfile and upstream value; OAuth origin, TLS and redirect behavior |
| Web outside that build | `__API_BASE_URL__` overrides `TTALKAK_API_BASE_URL`, then localhost fallback | Audit alternative build/runtime overrides before closing direct ingress |
| Production extension | `VITE_BACKEND_API_URL` compiled by Vite; all auth calls append `/api/auth/...`; generated manifest host permission uses that origin | Example points to web public domain, but the published installed bundle's actual value is unverified; migrate/rebuild and release before strict activation |
| Development extension | local config/legacy storage may override localhost default | Direct local backend requires optional mode or an isolated authenticated proxy |
| External API | No complete consumer inventory in the repository | Inventory consumers; move base URLs to trusted web ingress; never distribute proxy secret to browsers/extensions |

Production extension ignores stored development configuration (`loadBackendConfig`); the installed build, rather than a runtime setting switch, controls its API origin.

Public domains read back: `web-production-a82d94.up.railway.app` and `backend-production-35b61.up.railway.app`. Connected Railway OAuth redacts variable values, so actual BACKEND_UPSTREAM, FORWARD_HEADERS_STRATEGY, Dockerfile path and CORS values were not verified. Only variable names/config shape were read; secret values were not printed.

## Behavior and remaining gates

| Condition | Expected behavior / limitation |
| --- | --- |
| Optional mode; absent, invalid or duplicated attestation | Use original socket peer; XFF/Forwarded must not reset quota. Multiple users behind the same public edge/NAT can share quota and receive false 429 |
| Strict mode; absent/invalid attestation | Sensitive auth POST returns 503 AUTH_PROXY_REQUIRED before controller; direct backend clients fail |
| Strict mode; valid secret + valid canonical IP | Separate client quota; preflight remains available subject to CORS |
| nginx private caller controls X-Real-IP | nginx can attest attacker-supplied identity; shared secret alone does not solve ingress isolation |
| Sketch saturation | Fixed memory replaces 10,000-key cap; keyed hash impedes chosen collisions, but high cardinality can still cause false-positive 429 |
| Time/state | 12 five-second buckets can release quota up to about five seconds early; state is not shared across replicas and resets at restart |

Before strict activation: confirm published extension and external consumers use web ingress; confirm production nginx image and shared secret injection; independently verify public HTTP edge overwrites forged/duplicate X-Real-IP; verify nginx private/TCP ingress access cannot supply untrusted client identity; validate actual CORS including extension IDs and Google login origin. A disposable host-supplied X-Real-IP simulation is not evidence for these platform guarantees. Public domain removal also breaks other direct APIs, beyond the POSTs this filter guards.

No live auth request was sent, so no production counters, accounts, DB records or mail dispatch were exercised. Full platform ingress integration remains unverified even if final code CI succeeds.

## Minimal correction and new coverage

Match auth paths using the original servlet URI minus its original context path, and use that same route as quota key. nginx removes external X-Forwarded-Prefix. Regression coverage adds the strict prefix reproduction, optional-mode rotating prefixes combined with RFC Forwarded, duplicate-header dispatch rejection, all eight sensitive POSTs vs preflight, and servlet-context handling. Disposable nginx/Spring requests now include forged prefixes on both web and direct backend paths. Latest correction CI is pending; baseline green is not correction validation.
