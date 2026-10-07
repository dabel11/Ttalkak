package com.ttalkak.usage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** No product allowance is invented: enforcement requires explicit positive limits. */
@Component
public class MemberQuotaPolicy {
    private final boolean enabled;
    private final long freeLimit;
    private final long proLimit;

    public MemberQuotaPolicy(@Value("${ttalkak.usage.quota-enabled:false}") boolean enabled,
                             @Value("${ttalkak.usage.free-token-limit:0}") long freeLimit,
                             @Value("${ttalkak.usage.pro-token-limit:0}") long proLimit) {
        if (freeLimit < 0 || proLimit < 0 || (enabled && (freeLimit == 0 || proLimit == 0))) {
            throw new IllegalArgumentException("Quota enforcement requires positive FREE and PRO token limits");
        }
        this.enabled = enabled;
        this.freeLimit = freeLimit;
        this.proLimit = proLimit;
    }

    public boolean enabled() { return enabled; }
    public Long limit(String plan) {
        long value = "PRO".equals(plan) ? proLimit : freeLimit;
        return value > 0 ? value : null;
    }
}
