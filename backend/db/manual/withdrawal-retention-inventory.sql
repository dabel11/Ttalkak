-- TTALKAK withdrawal-retention INVENTORY ONLY.
-- Execute ONLY under a restricted, read-only connection, in an approved environment.
-- Returns aggregate COUNTS; no names, email addresses, tokens, message contents or keys.
-- This is NOT a deletion/cleanup script. It is NOT a statement of legal retention obligations.
-- Check actual information_schema first; physical names below use Hibernate snake_case naming.

SELECT 'inactive_members' AS metric, COUNT(*) AS rows_found
FROM members WHERE active = 0
UNION ALL
SELECT 'inactive_google_subject_still_set', COUNT(*)
FROM members WHERE active = 0 AND provider_subject IS NOT NULL
UNION ALL
SELECT 'inactive_member_user_id_reserved', COUNT(*)
FROM members WHERE active = 0 AND user_id IS NOT NULL
UNION ALL
SELECT 'inactive_private_make_threads', COUNT(*)
FROM make_threads t JOIN members m ON m.id = t.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_private_make_folders', COUNT(*)
FROM make_folders f JOIN members m ON m.id = f.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_community_prompts', COUNT(*)
FROM prompt_posts p JOIN members m ON m.id = p.author_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_community_comments', COUNT(*)
FROM comments c JOIN members m ON m.id = c.author_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_saved_links', COUNT(*)
FROM prompt_saves s JOIN members m ON m.id = s.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_liked_links', COUNT(*)
FROM prompt_likes l JOIN members m ON m.id = l.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_report_references', COUNT(*)
FROM reports r JOIN members m ON m.id = r.reporter_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_billing_subscriptions', COUNT(*)
FROM billing_subscriptions b JOIN members m ON m.id = b.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_auto_renew_enabled', COUNT(*)
FROM billing_subscriptions b JOIN members m ON m.id = b.member_id
WHERE m.active = 0 AND b.auto_renew = 1
UNION ALL
SELECT 'inactive_billing_keys_stored', COUNT(*)
FROM billing_subscriptions b JOIN members m ON m.id = b.member_id
WHERE m.active = 0 AND b.billing_key IS NOT NULL
UNION ALL
SELECT 'inactive_billing_charge_records', COUNT(*)
FROM billing_charges c JOIN members m ON m.id = c.member_id WHERE m.active = 0
UNION ALL
SELECT 'inactive_member_token_usage', COUNT(*)
FROM member_token_usage u JOIN members m ON m.id = u.member_id WHERE m.active = 0;

-- Interpretation:
-- - Nonzero private Make rows on withdrawn accounts may reflect PRE-PATCH
--   records. Do not delete them in production without a separate approved plan.
-- - Nonzero auto-renew on inactive accounts needs urgent owner/PG reconciliation.
-- - Reserved user ID, Google provider subject, billing and community retention
--   require a documented business/legal policy; never perform indiscriminate DELETE.
