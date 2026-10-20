# PR #69 privacy regression audit — 2026-10-21 KST

Scope: `hardening/backend-graduation-batch`, original head `74256eb9aed86a5c08319c4d8e27d82347e3127f`.
This is source/test evidence, not evidence of a deployed protection. No merge, review request,
deployment, production DB or payment configuration change is part of this audit.

## Existing evidence

- Original-head CI, Server container smoke, and Staging read-only acceptance succeeded.
  Container run: https://github.com/dabel11/Ttalkak/actions/runs/39254178896
  Its checkout was the synthetic PR merge `6efc310df96b37a5c7e1aa6c8cdd054f0dc0d72f`
  (head `74256eb` + base `667dd33`), not a merge into develop.
- Disposable MySQL/Spring/nginx smoke verifies public -> save/like/comment/report -> private.
  Both `/api/prompts/my` and `/api/me/library` exclude the other author's post for
  all/community/liked filters; author mine lists and detail remain available.
- `/api/me/comments` preserves the member's own comment but nulls prompt/promptTitle.
- `/api/me/reports` preserves report records while nulling target preview, author,
  prompt title/body/author and comment content for inaccessible parent posts.
- Direct private detail and new prompt/comment reports return 404 to another member.
- Existing mapper tests cover internal memo redaction and hidden comment author/text redaction;
  administrator memo remains available through the administrator mapper.

## Added regressions

- `ReportAuthorizationPrivacyTest`: real mapper with mocked repositories; private/deleted/missing
  prompt or parent, hidden/deleted/missing comment -> 404 and zero report repository interaction.
  Positive prompt/comment reports assert access-check -> save -> reporter response order.
  Anonymous calls return 401 before target lookup or report persistence.
- `ReportResponsePrivacyTest`: private/deleted/missing parent matrix for prompt and comment
  report history; explicit null-field assertions; private-owner and admin positive controls.
- Container smoke: reject private comment listing, creation, replies, editing, deletion,
  comment like/unlike, prompt save/unsave and like/unlike. Verify report history IDs/count,
  personal comment history, owner-visible post counters and original comment/replies unchanged.
- Historical report selection now uses (targetType, targetId), avoiding numeric ID collisions
  across prompt/comment tables.

## Interpretation and remaining boundaries

- Existing controllers check viewability before repository mutations in the above sequential paths.
  The new tests protect that ordering; they do not prove serialization against a simultaneous
  visibility change. Report creation has no encompassing transaction/lock, and mapper context
  assembly performs multiple reads. A concurrent transition needs a separate concurrency design/test.
- Saved/liked relationship rows are retained; list filtering hides the inaccessible post, rather
  than deleting past relationships. Report targetId/promptId/parentId/status metadata can remain.
  Reporter-entered reason and the member's own comment text also remain; these are not scrubbed
  for quoted text. The implementation protects fetched target text/identity, not every historical
  fact or user-authored quotation. Stricter identifier redaction requires a deliberate API policy.
- Admin access follows existing policy. Existing clients/screenshots/browser caches are outside
  these server response regressions. Hidden-comment author redaction here is specific to report history.
- Local Java execution was blocked downloading Gradle (network unreachable); Python compilation
  and git whitespace validation passed. New Java/container results must be read from the new-head CI,
  never inferred from the original-head success above.
- PR was open/unmerged and draft=false at audit start despite WIP/Draft wording. Draft metadata
  correction is explicitly outside this task; no review requested.
