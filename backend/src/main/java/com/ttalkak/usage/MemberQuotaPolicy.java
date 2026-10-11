package com.ttalkak.usage;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Monthly limits are opt-in until plan and billing contracts are approved. */
@Component
public class MemberQuotaPolicy {
    private final boolean enabled;
    private final long freeLimit;
    private final long proLimit;
    private final boolean requestQuotaEnabled;
    private final long freeRequestLimit;
    private final long lightRequestLimit;
    private final long standardRequestLimit;
    private final long proRequestLimit;

    @Autowired
    public MemberQuotaPolicy(@Value("${ttalkak.usage.quota-enabled:false}") boolean enabled,
                             @Value("${ttalkak.usage.free-token-limit:0}") long freeLimit,
                             @Value("${ttalkak.usage.pro-token-limit:0}") long proLimit,
                             @Value("${ttalkak.usage.request-quota-enabled:false}") boolean requestQuotaEnabled,
                             @Value("${ttalkak.usage.free-request-limit:0}") long freeRequestLimit,
                             @Value("${ttalkak.usage.light-request-limit:30}") long lightRequestLimit,
                             @Value("${ttalkak.usage.standard-request-limit:70}") long standardRequestLimit,
                             @Value("${ttalkak.usage.pro-request-limit:0}") long proRequestLimit) {
        if (freeLimit < 0 || proLimit < 0 || (enabled && (freeLimit == 0 || proLimit == 0))) {
            throw new IllegalArgumentException("Token quota enforcement requires positive FREE and PRO limits");
        }
        if (freeRequestLimit < 0 || lightRequestLimit < 0 || standardRequestLimit < 0 || proRequestLimit < 0
                || (requestQuotaEnabled && (freeRequestLimit == 0 || lightRequestLimit == 0
                || standardRequestLimit == 0 || proRequestLimit == 0))) {
            throw new IllegalArgumentException("Request quota enforcement requires positive limits for all tiers");
        }
        this.enabled = enabled;
        this.freeLimit = freeLimit;
        this.proLimit = proLimit;
        this.requestQuotaEnabled = requestQuotaEnabled;
        this.freeRequestLimit = freeRequestLimit;
        this.lightRequestLimit = lightRequestLimit;
        this.standardRequestLimit = standardRequestLimit;
        this.proRequestLimit = proRequestLimit;
    }

    /** Compatibility with token-only unit tests and callers. */
    public MemberQuotaPolicy(boolean enabled, long freeLimit, long proLimit) {
        this(enabled, freeLimit, proLimit, false, 0, 30, 70, 0);
    }

    /** Compatibility with prior FREE/PRO request-limit tests. */
    public MemberQuotaPolicy(boolean enabled, long freeLimit, long proLimit,
                             boolean requestQuotaEnabled, long freeRequestLimit, long proRequestLimit) {
        this(enabled, freeLimit, proLimit, requestQuotaEnabled,
                freeRequestLimit, 30, 70, proRequestLimit);
    }

    public boolean enabled() { return enabled; }
    public boolean requestQuotaEnabled() { return requestQuotaEnabled; }

    /** Legacy token quota is shared by all paid plans, not the usage-based pricing policy. */
    public Long limit(String plan) {
        long value = "FREE".equals(plan) ? freeLimit : proLimit;
        return value > 0 ? value : null;
    }

    /** No limit is advertised to customers until request quota enforcement is enabled. */
    public Long requestLimit(String plan) {
        if (!requestQuotaEnabled) return null;
        return switch (plan) {
            case "LIGHT" -> lightRequestLimit;
            case "STANDARD" -> standardRequestLimit;
            case "PRO" -> proRequestLimit;
            default -> freeRequestLimit;
        };
    }
}
