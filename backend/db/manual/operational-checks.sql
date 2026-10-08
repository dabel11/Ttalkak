-- Read-only checks; use a restricted DB session. No billing keys, credentials or prompts.
-- Unresolved payments older than 15 minutes (period_start is an approximation of order age).
SELECT member_id, status, period_start, period_end
FROM billing_charges
WHERE status = 'PENDING' AND period_start < UTC_TIMESTAMP(6) - INTERVAL 15 MINUTE;

-- Registered subscriptions that never acquired a first paid period.
SELECT member_id, auto_renew, next_charge_at
FROM billing_subscriptions
WHERE billing_key IS NOT NULL AND auto_renew = 1 AND next_charge_at IS NULL;

-- Metering uncertainty and expired request leases; do not clear without reconciliation.
SELECT member_id, expires_at, usage_uncertain
FROM member_request_lease
WHERE usage_uncertain = 1 OR (permit_id IS NOT NULL AND expires_at < UTC_TIMESTAMP(6));

-- Only aggregate member consumption; not a complete provider cost ledger.
SELECT DATE(occurred_at) AS utc_day, COUNT(*) AS requests, SUM(total_tokens) AS tokens
FROM member_token_usage
WHERE occurred_at >= UTC_TIMESTAMP(6) - INTERVAL 7 DAY
GROUP BY DATE(occurred_at) ORDER BY utc_day;
