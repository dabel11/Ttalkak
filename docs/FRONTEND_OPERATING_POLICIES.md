# Frontend Operating Policies

This document records frontend decisions that remain valid regardless of which AI or RAG design is selected. Research papers and experiments may motivate a proposal, but they do not change the frontend contract until the AI, backend, and frontend owners agree on an API example and rollout plan.

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
