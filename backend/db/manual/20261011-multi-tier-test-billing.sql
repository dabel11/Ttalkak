-- TTALKAK: Multi-tier billing/test upgrade storage (MySQL 8+).
-- Manual migration; do not execute against production without backup + schema review.
-- Apply once only. Existing NULL plan_code rows preserve legacy PRO semantics.
-- Hibernate ddl-auto=update may already add these columns in staging: verify first.
-- Check: SHOW COLUMNS FROM billing_subscriptions; SHOW COLUMNS FROM billing_charges;
--        SHOW COLUMNS FROM paid_usage_periods;

ALTER TABLE billing_subscriptions
    ADD COLUMN plan_code VARCHAR(16) NULL;

ALTER TABLE billing_charges
    ADD COLUMN plan_code VARCHAR(16) NULL,
    ADD COLUMN amount_krw INT NULL,
    ADD COLUMN charge_kind VARCHAR(16) NULL,
    ADD COLUMN upgrade_request_limit BIGINT NULL;

ALTER TABLE paid_usage_periods
    ADD COLUMN plan_code VARCHAR(16) NULL,
    ADD COLUMN request_limit_override BIGINT NULL;

-- Legacy NULL billing charge amount represents the previous 4,900 KRW PRO test order.
-- Never backfill legacy pending orders with the new 9,900 KRW amount.
