package com.ttalkak.auth;

import jakarta.persistence.*;

/** Short-lived HMAC identities and at most thirty accepted request timestamps; no raw IP. */
@Entity
@Table(name = "auth_rate_limit_state", indexes = @Index(name = "idx_auth_limit_expiry", columnList = "expires_at"))
public class AuthRateLimitState {
    @Id @Column(name = "bucket_key", length = 64, nullable = false)
    private String bucketKey;
    @Column(name = "accepted_at", length = 1024, nullable = false)
    private String acceptedAt;
    @Column(name = "expires_at", nullable = false)
    private long expiresAt;
    protected AuthRateLimitState() { }
}
