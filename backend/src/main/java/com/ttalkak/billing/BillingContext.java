package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Persisted store namespace is independent of rotating API secrets. */
@Component
public class BillingContext {
    public static final String LEGACY_TEST = "test:legacy";
    private final String mode;
    private final String scope;

    public BillingContext(@Value("${ttalkak.billing.mode:test}") String mode,
                          @Value("${ttalkak.billing.store-scope:test:legacy}") String scope) {
        if (!java.util.Set.of("test", "live", "disabled").contains(mode)) {
            throw new IllegalArgumentException("Unknown billing mode");
        }
        if ("live".equals(mode) && (scope == null || !scope.startsWith("live:"))) {
            throw new IllegalArgumentException("Live mode requires a distinct live store scope");
        }
        if ("test".equals(mode) && (scope == null || !scope.startsWith("test:"))) {
            throw new IllegalArgumentException("Test mode requires a test store scope");
        }
        this.mode = mode;
        // Reject case aliases: Java equality and case-insensitive MySQL queries must
        // identify the same namespace, especially the nullable test:legacy rows.
        if (scope == null || !scope.matches("(?:test|live):[a-z0-9_-]{1,64}")) {
            throw new IllegalArgumentException("Billing store scope must use lowercase ASCII");
        }
        this.scope = scope;
    }
    public String scope() { return scope; }
    public boolean matches(String stored) { return scope.equals(stored == null ? LEGACY_TEST : stored); }
    public boolean testEnabled() { return "test".equals(mode) && scope.startsWith("test:"); }
    public void requireTest() {
        // Live remains blocked until contract, policies and real approval/cancel verification are complete.
        if (!testEnabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "BILLING_NOT_CONFIGURED", "현재 결제 환경에서는 결제를 제공하지 않습니다.");
    }
    public void requireScope(String stored) {
        if (!matches(stored)) throw new ApiException(HttpStatus.CONFLICT,
                "BILLING_STORE_MISMATCH", "다른 결제 환경의 데이터입니다. 관리자 확인이 필요합니다.");
    }
}
