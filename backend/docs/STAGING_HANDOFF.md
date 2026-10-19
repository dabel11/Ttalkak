# Staging handoff — 2026-10-04

## Source integration update — 2026-10-06

Server #29, billing/usage #32/#33, auth #35 and Resend #37 are merged into develop.
The checked develop commit is `5e71ff7a7d804f9e8f0e05fa28b7fa5a23adf422` and its CI succeeded.
This does not establish what commit is currently deployed in Railway.
The current develop RAG response still lacks usage. See MEMBER_QUOTA.md and
OPERATIONS_READINESS.md for the proposed follow-up and acceptance criteria.

## Historical deployment observations — 2026-10-04

- Web: https://web-production-a82d94.up.railway.app/
- Backend: https://backend-production-35b61.up.railway.app/
- Web `/healthz` and proxied `/api/tags/popular` return HTTP 200.
- Browser: Home list/tags, search, sort, post detail and comments render.
- Login/signup forms render; account creation and authenticated browser flows
  have not been verified. Google OAuth is explicitly a demo.
- A guest Make request displays an AI-service error and re-enables input.
  Successful generation and deployed three-use enforcement are not verified.
- Railway rag-server has no deployments. Web/backend/MySQL are Online.

## AI owner — next work

1. Join the existing Railway project; use its rag-server and shared MySQL.
2. Choose the AI commit containing both the intended model pipeline and usage
   response. Add provider secrets only through Railway Variables.
3. Verify required memory/storage and plan cost before enabling a heavy model.
4. With server PR #29 available, use root `/rag-server` and config path
   `/rag-server/railway.json`; listen on port 8000.
5. Populate/index the knowledge data in this database. A new database does not
   contain the old RAG knowledge automatically.
6. Verify `/health`, retrieval and a real `/query` response. Return sanitized
   `usage` JSON with `input_tokens`, `output_tokens`, `total_tokens`, optional
   `calls`; explain whether output/total include thinking and cached tokens.
   Never send an API key or a full private prompt in verification evidence.
7. Report the deployed branch/commit and readiness for backend integration.

## Backend connection after RAG is ready

Set backend `RAG_SERVER_URL=http://${{rag-server.RAILWAY_PRIVATE_DOMAIN}}:8000`
and apply the change. No public RAG domain is required. Keep the stable JWT
secret and existing MySQL volume; do not reset the database.

Run real guest successes 1–3, reject the fourth request, verify AI errors do
not consume allowance, and verify persistence after backend restart. Then
verify member conversation save/replay and usage recording once per requestId.
Use a distinct requestId for each new turn; reuse it only for the same request.

## Integration and review

- Source changes are merged; verify deployed web/backend commits rather than reopening superseded PRs.
- Guest frontend and backend must remain deployed together.
- Keep the DB volume and stable JWT secret.
- The observations above are a dated snapshot; recheck actual RAG availability and indexing.

## Frontend owner

- After an uncertain payment, re-fetch billing and usage; show PENDING without
  immediately creating another payment or showing PRO solely from autoRenew.
- Web complete/retry timeouts are 90s. Provider waits share a default 60s
  budget; database stalls are not covered by a hard end-to-end deadline.
- Configure real Google OAuth if included in the release scope.
- Set the extension's deployed backend URL, manifest host_permissions and
  actual extension ID; backend CORS must permit that specific extension origin.

## Team decisions still needed

- Actual PRO price and FREE/PRO allowance, reset periods and over-limit policy.
- Configurable `/api/me/usage` quota fields and enforcement are proposed in MEMBER_QUOTA.md.
  Enforcement defaults off until these decisions and actual usage readiness are confirmed.
- Toss integration remains test-only. Confirm readiness before real payments.
- RAG readiness and payment/usage frontend integration are separate completion
  criteria; successful web deployment is not full release acceptance.
