package com.ttalkak.auth;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name="revoked_auth_token")
public class RevokedAuthToken {
    @Id
    @Column(length=64)
    private String tokenHash;
    @Column(nullable=false)
    private Instant expiresAt;
    protected RevokedAuthToken() { }
    public RevokedAuthToken(String hash, Instant expiresAt) { this.tokenHash = hash; this.expiresAt = expiresAt; }
}
