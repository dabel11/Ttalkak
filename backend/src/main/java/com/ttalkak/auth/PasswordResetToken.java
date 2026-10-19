package com.ttalkak.auth;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "password_reset_token")
public class PasswordResetToken {
    @Id
    private Long memberId;
    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private Instant requestedAt;
    protected PasswordResetToken() { }
    public PasswordResetToken(Long memberId, String tokenHash, Instant now) {
        this.memberId = memberId;
        renew(tokenHash, now);
    }
    public void renew(String hash, Instant now) {
        tokenHash = hash;
        requestedAt = now;
        expiresAt = now.plusSeconds(900);
    }
    public Long getMemberId() { return memberId; }
    public Instant getRequestedAt() { return requestedAt; }
    public boolean validAt(Instant now) { return expiresAt.isAfter(now); }
}
