-- TTALKAK: Multi-tier billing/test upgrade storage (MySQL 8+).
-- Manual fallback ONLY when JPA_DDL_AUTO does not update the schema.
-- Railway's current configuration uses JPA_DDL_AUTO=update; inspect first.
-- Always verify current columns/types and confirm a restorable backup before deploying.
-- Intended for the MySQL CLI (DELIMITER is not supported by every SQL GUI).
-- All additions are conditional, so a partial previous run or Hibernate-created
-- columns can be safely skipped. Existing columns with incorrect types still require
-- manual review: this script NEVER overwrites or drops them.
-- Read-only check before and after:
-- SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME IN ('billing_subscriptions','billing_charges','paid_usage_periods')
-- ORDER BY TABLE_NAME, ORDINAL_POSITION;

DELIMITER $$
DROP PROCEDURE IF EXISTS ttalkak_migrate_multi_tier_20261011$$
CREATE PROCEDURE ttalkak_migrate_multi_tier_20261011()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_subscriptions' AND COLUMN_NAME = 'plan_code') THEN
        ALTER TABLE billing_subscriptions ADD COLUMN plan_code VARCHAR(16) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_charges' AND COLUMN_NAME = 'plan_code') THEN
        ALTER TABLE billing_charges ADD COLUMN plan_code VARCHAR(16) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_charges' AND COLUMN_NAME = 'amount_krw') THEN
        ALTER TABLE billing_charges ADD COLUMN amount_krw INT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_charges' AND COLUMN_NAME = 'charge_kind') THEN
        ALTER TABLE billing_charges ADD COLUMN charge_kind VARCHAR(16) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_charges' AND COLUMN_NAME = 'upgrade_request_limit') THEN
        ALTER TABLE billing_charges ADD COLUMN upgrade_request_limit BIGINT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paid_usage_periods' AND COLUMN_NAME = 'plan_code') THEN
        ALTER TABLE paid_usage_periods ADD COLUMN plan_code VARCHAR(16) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paid_usage_periods' AND COLUMN_NAME = 'request_limit_override') THEN
        ALTER TABLE paid_usage_periods ADD COLUMN request_limit_override BIGINT NULL;
    END IF;
END$$
CALL ttalkak_migrate_multi_tier_20261011()$$
DROP PROCEDURE ttalkak_migrate_multi_tier_20261011$$
DELIMITER ;

-- Legacy NULL billing charge amounts represent previous 4,900 KRW PRO test orders.
-- Do not backfill legacy PENDING orders with the new 9,900 KRW amount.
