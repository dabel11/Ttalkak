# Staging handoff — 2026-10-04

## Verified now

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

- #29 supplies server configuration; #32 supplies billing and member usage.
- A follow-up based on #32 adds bounded billing provider waits and transient
  payment error recovery. If merged before #32, it includes #32's changes.
- Integrate both server and latest billing changes before changing Railway web
  and backend source branches to develop. A billing-only branch does not yet
  include the Railway server configuration.
- #25's guest backend requires #26's frontend in the same deployment or earlier.
  Both are already included in the current server branch.
- Close superseded #27/#30/#31/#32 only after the replacement is merged and
  their changes are present. Do not delete an unmerged working branch.

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
- `/api/me/usage` limit/remaining/limitReached and quota enforcement depend on
  these decisions. Actual token logging alone does not enforce a quota.
- Toss integration remains test-only. Confirm readiness before real payments.
- RAG readiness and payment/usage frontend integration are separate completion
  criteria; successful web deployment is not full release acceptance.
