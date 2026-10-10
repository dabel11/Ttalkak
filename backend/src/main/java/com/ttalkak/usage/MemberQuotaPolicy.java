package com.ttalkak.usage;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Quotas are opt-in: proposed FREE/PRO allowances never become active silently. */
@Component
public class MemberQuotaPolicy {
    private final boolean enabled;
    private final long freeLimit;
    private final long proLimit;
    private final boolean requestQuotaEnabled;
    private final long freeRequestLimit;
    private final long proRequestLimit;

    @Autowired
    public MemberQuotaPolicy(@Value("${ttalkak.usage.quota-enabled:false}") boolean enabled,
                             @Value("${ttalkak.usage.free-token-limit:0}") long freeLimit,
                             @Value("${ttalkak.usage.pro-token-limit:0}") long proLimit,
                             @Value("${ttalkak.usage.request-quota-enabled:false}") boolean requestQuotaEnabled,
                             @Value("${ttalkak.usage.free-request-limit:0}") long freeRequestLimit,
                             @Value("${ttalkak.usage.pro-request-limit:0}") long proRequestLimit) {
        if (freeLimit < 0 || proLimit < 0 || (enabled && (freeLimit == 0 || proLimit == 0))) {
            throw new IllegalArgumentException("Token quota enforcement requires positive FREE and PRO limits");
        }
        if (freeRequestLimit < 0 || proRequestLimit < 0
                || (requestQuotaEnabled && (freeRequestLimit == 0 || proRequestLimit == 0))) {
            throw new IllegalArgumentException("Request quota enforcement requires positive FREE and PRO limits");
        }
        this.enabled = enabled;
        this.freeLimit = freeLimit;
        this.proLimit = proLimit;
        this.requestQuotaEnabled = requestQuotaEnabled;
        this.freeRequestLimit = freeRequestLimit;
        this.proRequestLimit = proRequestLimit;
    }

    /** Compatibility with existing tests that configure token-only quotas. */
    public MemberQuotaPolicy(boolean enabled, long freeLimit, long proLimit) {
        this(enabled, freeLimit, proLimit, false, 0, 0);
    }

    public boolean enabled() { return enabled; }
    public boolean requestQuotaEnabled() { return requestQuotaEnabled; }

    public Long limit(String plan) {
        long value = "PRO".equals(plan) ? proLimit : freeLimit;
        return value > 0 ? value : null;
    }

    /** Unapproved request allowances must not appear as live product limits. */
    public Long requestLimit(String plan) {
        if (!requestQuotaEnabled) return null;
        return "PRO".equals(plan) ? proRequestLimit : freeRequestLimit;
    }
}
