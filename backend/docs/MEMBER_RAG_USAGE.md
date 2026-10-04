# Member RAG usage integration

## Contract and accounting

The verified contract on AI branch `claude/ai-token-usage-tracking-8nfgua`
is `/query` response `usage` containing `input_tokens`, `output_tokens`,
`total_tokens`, and optional `calls`. Its implementation differs from the
team cost document's per-call `prompt/completion/thoughts` format.

Spring records the reported request-level totals once for each member and
client `requestId`. It does not sum the already-aggregated `calls` again.
Different turns must have different client request IDs; a conversation ID
must not be reused as the usage key for every turn. Without a request ID,
each actual invocation gets its own server-generated usage key.

`totalTokens` preserves the provider's total, including reasoning tokens if
the provider includes them. `outputTokens` preserves the reported output;
it must not be assumed to include thinking. No subtraction or extra addition
is used to invent separate thinking usage. Optional per-call `thoughts_tokens`
or `thoughts` and cached counts are retained when explicitly provided.

## Storage and behavior

- `member_token_usage` keeps its existing unique `(member_id, request_key)`.
- Nullable `usage_details_json` stores only stage/model/backend and whitelisted
  numeric token fields. Existing rows do not require synthetic detail data.
- Prompt text, generated answers, arbitrary provider metadata, and secrets
  are not stored in that field.
- Stored conversation replays return before invoking RAG or recording usage.
- Recording occurs after a valid RAG success and before saving the conversation,
  so provider consumption is retained even if conversation persistence fails.
- Guest calls, RAG error responses, and synthetic 404 fallback responses do not
  become member usage records.
- Missing, zero, or invalid reported usage does not create an estimated row.
  Missing/invalid usage emits a content-free warning; old RAG deployments still
  function. This is compatibility behavior, not proof that requests are free.
- Existing `/api/me/usage` FREE calendar / PRO paid-period sums include these rows.
  Its response fields remain unchanged; no price or quota is invented.

## Deployment and follow-up

Review together with #31. The real AI usage implementation must be integrated
and deployed separately; current develop does not return this contract yet.
Use staging `JPA_DDL_AUTO=update` to add the nullable TEXT column; a managed
production schema needs an explicit migration before deploying this code.

Ask AI to confirm the exact deployed JSON with token counts only, including
thinking/cached semantics. Model-specific pricing requires accurate per-call
counts, not just the member's total-token sum.

This records member consumption, not a complete provider cost ledger: anonymous
traffic, partial provider work before a RAG error/timeout, and multiple actual
provider invocations for concurrent retries need separate operational accounting.
Client idempotency prevents double member usage; it does not refund duplicate
provider calls. FREE/PRO token limits and over-limit handling remain a separate
policy and enforcement task.
