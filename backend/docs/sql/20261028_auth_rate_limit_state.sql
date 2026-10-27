-- Additive migration for schema-managed deployments. Review and apply only during
-- an authorized rollout; never run this against an operator URL from CI.
-- Hibernate ddl-auto=update creates the equivalent table in disposable rehearsals.
CREATE TABLE IF NOT EXISTS auth_rate_limit_state (
    bucket_key VARCHAR(64) NOT NULL,
    accepted_at VARCHAR(1024) NOT NULL,
    expires_at BIGINT NOT NULL,
    PRIMARY KEY (bucket_key),
    INDEX idx_auth_limit_expiry (expires_at)
) ENGINE=InnoDB;
