-- Additive schema for this PR only; not a complete baseline or an automatic migration.
-- Run against a restored disposable copy first. Retain this table on code rollback.
CREATE TABLE IF NOT EXISTS member_request_lease (
    member_id BIGINT NOT NULL,
    permit_id VARCHAR(36) NULL,
    expires_at DATETIME(6) NULL,
    usage_uncertain BIT(1) NOT NULL,
    PRIMARY KEY (member_id)
);
