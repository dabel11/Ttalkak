package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import org.springframework.boot.autoconfigure.web.ServerProperties;

/** In-memory fixture for isolated header/dispatch tests; never packaged in the app. */
class TestAuthRateLimitFilter extends AuthRateLimitFilter {
    private final FixtureLimiter fixture;
    TestAuthRateLimitFilter(ApiErrorWriter errors) { this(errors, "", false); }
    TestAuthRateLimitFilter(ApiErrorWriter errors, String secret) { this(errors, secret, false); }
    TestAuthRateLimitFilter(ApiErrorWriter errors, String secret, boolean required) {
        this(errors, secret, required, new FixtureLimiter());
    }
    private TestAuthRateLimitFilter(ApiErrorWriter errors, String secret, boolean required, FixtureLimiter fixture) {
        super(errors, secret, required, serverProperties(), fixture);
        this.fixture = fixture;
    }
    private static ServerProperties serverProperties() {
        var properties = new ServerProperties();
        properties.setForwardHeadersStrategy(ServerProperties.ForwardHeadersStrategy.NONE);
        return properties;
    }
    boolean allow(String address, String path, long now) { return fixture.allowAt(address, path, now); }

    private static final class FixtureLimiter implements AuthRequestLimiter {
        private final java.util.Map<String, java.util.ArrayDeque<Long>> histories = new java.util.HashMap<>();
        public boolean allow(String address, String path) { return allowAt(address, path, System.currentTimeMillis()); }
        synchronized boolean allowAt(String address, String path, long now) {
            var history = histories.computeIfAbsent(address + "\0" + path, key -> new java.util.ArrayDeque<>());
            history.removeIf(time -> time <= now - 60_000);
            if (history.size() >= AuthRequestLimiter.limit(path)) return false;
            history.addLast(now);
            return true;
        }
    }
}
