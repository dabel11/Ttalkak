# Frontend Operating Policies

This document records frontend decisions that remain valid regardless of which AI or RAG design is selected. Research papers and experiments may motivate a proposal, but they do not change the frontend contract until the AI, backend, and frontend owners agree on an API example and rollout plan.

## Dependency update automation

- `.github/dependabot.yml` creates separate weekly update PRs for the web frontend, Chrome Extension, and GitHub Actions.
- Version-update PRs target `develop-integrated`; the configuration must also be present on the repository default branch (`main`) for Dependabot to activate it.
- Patch and minor updates are grouped per frontend surface. Major updates are intentionally excluded and require a separately planned compatibility review.
- Dependabot PRs must pass the same CI jobs as human-authored changes and are not auto-merged by this policy.
- Repository-level Dependabot security updates remain governed by GitHub settings and are not disabled by the version-update grouping policy.

## 1. Production configuration register

Complete every `TBD` before a production release. Values containing credentials or private keys must live in the deployment secret store, not in this repository.

| Item | Current value | Owner | Release evidence |
| --- | --- | --- | --- |
| Production web URL | TBD | Web/infra | URL and health check |
| Production Spring Boot API URL | TBD | Backend/infra | HTTPS URL and frontend production build |
| Chrome Web Store Extension ID | TBD until store registration | Extension/release | Store dashboard ID |
| Production Extension CORS origin | `chrome-extension://{productionExtensionId}` | Backend | Successful preflight |
| Privacy policy URL | Published Google Docs URL in `extension/src/constants.js` | Product/legal | Public read-only URL |
| Extension support URL | TBD | Product | Public support page |
| Incident/contact channel | TBD | Team lead | Named monitored channel |
| Web production command | `npm run build:prod` | Web | `npm run verify` success |
| Extension production command | PowerShell: `$env:VITE_BACKEND_API_URL='https://...'; npm run build:prod`<br>POSIX: `VITE_BACKEND_API_URL=https://... npm run build:prod` | Extension | `dist-prod` policy check |
| Post-release smoke | See `WEB_STORE_RELEASE_CHECKLIST.md` | Release owner | Signed checklist |

Production Extension readiness is enforced by `npm run release:prepare` from `extension`. It requires explicit production API, Web Store ID, privacy-policy URL, support URL, and release owner values; validates the generated manifest; checks both public pages; and performs an exact-origin credentialed CORS preflight. Development IDs and placeholder hosts never count as release evidence.

## 2. API change procedure

An AI/backend response change is ready for frontend implementation only after the following sequence is satisfied:

1. Provide representative success and failure response examples.
2. Mark every field as required or optional and define backward compatibility.
3. Update `docs/prompt-improve-contract.schema.json` or the applicable API contract.
4. Update frontend runtime validation before rendering the new field.
5. Update the shared message normalizer when the field belongs to both web and Extension.
6. Add the applicable cases to the shared response fixture matrix.
7. Add unit/contract tests in both consumers that use the field.
8. Run fixture browser tests and an actual Extension smoke when Extension behavior changes.
9. Verify previously stored and legacy messages still render.

Unknown optional fields must be ignored safely. A paper, prototype, or backend-only experiment does not by itself authorize a frontend contract change.

## 3. Shared AI response fixture policy

The canonical cross-client fixture is `fixtures/prompt-improve-responses.json`. New AI response states must add or update a case there before client-specific fixtures are added.

The minimum matrix is:

- successful `improve`;
- successful `ask`, with required and optional questions;
- response without optional fields;
- response with an unknown additional field;
- empty arrays and empty optional strings;
- successful `no_evidence` fallback;
- AI service unavailable;
- request timeout;
- user-cancelled client message;
- legacy stored assistant message.

Fixtures must contain synthetic text only. Do not copy user prompts, production conversations, tokens, or retrieved document bodies into tests.

## 4. User-facing copy policy

- State what the user can do next whenever an action is available.
- Distinguish network failure, authentication expiry, AI service failure, timeout, and invalid response.
- Do not style successful fallback, user cancellation, or an intentionally skipped operation as an error.
- Never expose stack traces, internal exception text, credentials, or raw backend diagnostics.
- Describe a retrieval score as similarity or rank, never as correctness, confidence, or trustworthiness.
- Keep the same event wording consistent between conversation messages, notices, and retry controls.
- Preserve accessibility semantics: expected status changes use `role="status"`; actionable failures use an associated error message.

## 5. Data and observability policy

Frontend telemetry is opt-in and requires an agreed purpose, owner, retention period, and user disclosure before implementation.

Do not collect by default:

- original prompts or generated prompts;
- conversation history;
- authentication tokens or session identifiers usable for authentication;
- retrieved document bodies;
- browser page content;
- clipboard content.

If approved later, prefer content-free aggregates such as operation type, coarse status code, duration bucket, retry, or cancellation. Logs must use the central reporter and must not serialize request payloads.

The runtime enforces this policy in `src/observability/client-error-reporter.mjs`:

- external collection is disabled by default;
- emitted records use a fixed metadata-only field allowlist;
- network, AI, and contract failures include only status, elapsed milliseconds, retryability, and failure/cancel outcome;
- the browser emits a local `ttalkak:observability` integration event containing the smaller aggregate allowlist;
- prompt, history, token, document, page-content, and clipboard context is discarded;
- bearer/query credentials, email addresses, and phone numbers are redacted;
- error messages are length-bounded before reaching a sink;
- a sink failure never interrupts the user workflow.

Enabling a remote sink requires a separate reviewed change that records its owner, purpose, retention period, user disclosure, and deletion process. A deployment URL or vendor key alone is not authorization to enable collection.

### Current release decision (2026-08-14)

- Owner: frontend team.
- External collection: disabled.
- Collection purpose: none until a separate product/privacy review approves one.
- Remote retention: 0 days because no remote events are sent.
- User disclosure: not required for disabled collection; it becomes mandatory before activation.
- The local aggregate event is an integration boundary only and must not be forwarded by deployment code without that review.
- Web and Extension Make flows emit only content-free local outcome records for `IMPROVED`, `ASK`, `NO_EVIDENCE`, `UNCHANGED_NO_EVIDENCE`, cancellation, timeout, AI failure, and contract failure. These records contain classification, status, elapsed time, retryability, and timestamp only; they do not constitute remote collection.

## 6. Supported frontend scope

| Surface | Supported scope |
| --- | --- |
| Web | Current desktop Chromium and Firefox |
| Web small screens | Core navigation and actions must remain available; mobile-first optimization is not promised |
| Chrome Extension | Current stable Google Chrome desktop |
| Mobile Extension | Not supported |
| Edge/Safari Extension | Not supported until separately planned and tested |

Accessibility checks such as keyboard operation, 200% zoom, focus management, readable long Korean text, and error association remain required on supported desktop surfaces.

## 7. Review cadence

Review this document when an API contract changes, before a public release, when a new browser becomes supported, or when telemetry is proposed. Avoid speculative implementation before one of those triggers occurs.

## 8. Account withdrawal integration smoke

Use `ACCOUNT_WITHDRAWAL_SMOKE_CHECKLIST.md` for the disposable-account integration check. Never record test passwords, access tokens, database credentials, or production user data in the checklist or test output.

Use the local verification script at one of two levels:

- `powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1` runs the fast web, Extension, and backend checks.
- `powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1 -Full` additionally runs Chromium fixture E2E, Firefox smoke, and production-bundle E2E.

The script reads the ignored root `.env` without printing its values and restores the caller's database environment variables when it finishes. Browser E2E uses an isolated fixture server on `127.0.0.1:4174` and a production server on `127.0.0.1:4175`; override them with `TTALKAK_E2E_PORT` and `TTALKAK_E2E_PROD_PORT` when those ports are unavailable. Existing servers are never reused, so a collision fails with an explicit diagnostic instead of testing a stale preview.

## 9. Make request idempotency boundary

- Web and Extension generate a new `requestId` for each logged-in server-thread request.
- A retry of the same prompt on the same thread reuses that ID; editing the prompt creates a new ID.
- Failed-message state retains the ID so a response saved by the backend but lost in transit can be replayed without appending another turn.
- `replayed: true` is treated as an ordinary successful response and must not create a duplicate local user or assistant message.
- `409 / REQUEST_ID_REUSED` is non-retryable with the stale ID. Refresh the canonical server thread and require the next changed request to use a new ID.
- Anonymous requests and a new conversation before it has a server `threadId` keep the existing non-idempotent behavior.
- This contract deduplicates requests only after a turn has been saved. It does not guarantee serialization of two requests that reach the backend concurrently before either save completes; that remains a backend concurrency-policy responsibility. Frontend in-flight guards remain required but are not a server-side concurrency guarantee.
