package com.ttalkak.auth;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import java.time.Instant;

@Component
public class AuthTokenCleanup {
    private final RevokedAuthTokenRepository tokens;
    public AuthTokenCleanup(RevokedAuthTokenRepository tokens) { this.tokens = tokens; }
    @Scheduled(fixedDelay=3600000)
    public void cleanup() { tokens.deleteExpired(Instant.now()); }
}
