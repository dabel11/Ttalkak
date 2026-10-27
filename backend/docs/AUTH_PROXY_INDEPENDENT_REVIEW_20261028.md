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

Match auth paths using the original servlet URI minus its original context path, and use that same route as quota key. nginx removes external X-Forwarded-Prefix. Regression coverage adds the strict prefix reproduction, optional-mode rotating prefixes combined with RFC Forwarded, duplicate-header dispatch rejection, all eight sensitive POSTs vs preflight, and servlet-context handling. Disposable nginx/Spring requests now include forged prefixes on both web and direct backend paths. Correction `9031b89` passed CI #621 and container smoke #350. Those results do not validate subsequent changes; see the PR body for the current HEAD verdict.


## Follow-up: mapped IPv6 compatibility and local-state boundaries

- Reproduction commit `f1750778b17e3c4e24768b275604a47dc5f06aed`: [CI #622](https://github.com/dabel11/Ttalkak/actions/runs/40573410773), backend job 122433329440, **304 tests, 1 failed**. Only `strictProxyAcceptsMappedIpv6WithoutCreatingAnotherIpv4Quota` failed. Valid `::ffff:203.0.113.7` / `::FFFF:CB00:7107` literals normalize to IPv4 in Java; the prior colon-required return check rejected them. This reproduces a compatibility defect in isolated requests; it does not establish that Railway emits mapped addresses.
- Minimal correction accepts the parsed canonical IPv4 result. Plain IPv4 and mapped IPv6 share one identity and allowance. Header authentication, duplicate-header checks, literal-only character restrictions, and strict rejection of invalid attestations remain in place. The new dispatch regression alternates all three spellings, accepts the first ten recovery requests and rejects the eleventh with 429.
- Disposable nginx/Spring smoke now alternates plain IPv4 and both mapped spellings and verifies their shared quota. This still simulates a trusted edge; no live auth or email request is authorized by the smoke test.
- New boundary tests explicitly demonstrate independent quotas on two filter instances (also modeling process replacement) and a shared quota for unauthenticated users on one socket peer. They document existing limitations, not fixes. No shared state or external service was introduced.
- Existing 20,000/25,000-identity tests show behavior for those workloads only; they do not prove immunity to sketch saturation. All four row minima can rise for an unseen identity under sufficiently high occupancy, causing false-positive throttling. Keyed HMAC prevents predictable preselected collisions, not volumetric saturation. Production load/error-rate assessment and a shared ingress limiter remain unresolved.
- Historical readiness guidance was corrected: `FORWARD_HEADERS_STRATEGY=framework` alone does not authenticate the limiter's client identity. The security-gate summary now describes the current 5-second sketch buckets instead of obsolete map cleanup.

The current HEAD CI/container result is maintained in PR #81. The mapped-address correction is not complete until that exact HEAD passes; reproduction failure and earlier green commits are not substitute evidence. Draft and release-blocked status remain unchanged.


## Follow-up: native Tomcat request mutation

- Prior HEAD `2218013` passed all six jobs of [CI #623](https://github.com/dabel11/Ttalkak/actions/runs/40574038378) and container smoke #352, including browser/Firefox/production-bundle checks. This is historical evidence, not validation of the following changes.
- Reproduction commit `cf587b230b036ac23f4ee5072b056f352d1fd5cf`: [CI #624](https://github.com/dabel11/Ttalkak/actions/runs/40577224861), backend job 122446783182: **307 tests, 1 failed**. Only `nativeForwardingMustFailConfigurationBeforeAcceptingAuthRequests` failed; the real loopback Tomcat test succeeded in demonstrating eleven admitted recovery-route requests with eleven forged XFF identities. It uses a probe servlet, not the application controller; no database, accounts, email, or production service is involved.
- `RemoteIpValve` changes the underlying request before servlet filters. Unwrapping `HttpServletRequest` cannot recover the socket address in this mode. The prior filter accepted this configuration without an invariant check. This is a reproducible unsafe configuration boundary, not evidence that production currently uses native forwarding.
- Spring Boot 3.5.16's [Tomcat factory customizer](https://github.com/spring-projects/spring-boot/blob/v3.5.16/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/web/embedded/TomcatWebServerFactoryCustomizer.java) enables the valve for native/implicit platform strategy **or either explicit Tomcat remote-IP/protocol header**, including under a global none/framework strategy. Merely checking a raw environment string would miss those overrides.
- Correction checks the bound `ServerProperties` at filter construction. The supported explicit strategies are NONE and FRAMEWORK, without `server.tomcat.remoteip.remote-ip-header` or `server.tomcat.remoteip.protocol-header`. Native, implicit/null strategy and either explicit Tomcat header are rejected at startup with a configuration error. Existing constructors used by isolated tests explicitly select NONE.
- Regression configuration contexts check native rejection, allowed none/framework, both header overrides under both allowed strategies, and empty/implicit strategy rejection. The standalone native Tomcat probe remains as evidence that the startup restriction is necessary; it deliberately constructs the filter outside application configuration to expose the otherwise lost socket peer.
- Deployment compatibility: inspect actual forwarded strategy and Tomcat remoteip variables before rollout. A currently native-configured deployment will intentionally fail startup after this change until a reviewed compatible configuration is selected. No production variable was inspected or changed during this follow-up. Custom valves or an externally managed servlet container are outside this embedded application configuration guarantee.

Current HEAD validation remains in PR #81; the reproduction result must not be reported as a successful correction. Actual Railway ingress, sketch saturation, time quantization, and replica/restart state remain separate unresolved gates.
