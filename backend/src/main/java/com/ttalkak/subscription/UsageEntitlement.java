package com.ttalkak.subscription;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

public record UsageEntitlement(
        String plan,
        String status,
        int dailyLimit,
        int usedToday,
        int remainingToday,
        OffsetDateTime resetAt,
        OffsetDateTime currentPeriodEnd,
        boolean cancelAtPeriodEnd
) {
    public Map<String, Object> toMap() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("plan", plan);
        value.put("status", status);
        value.put("dailyLimit", dailyLimit);
        value.put("usedToday", usedToday);
        value.put("remainingToday", remainingToday);
        value.put("resetAt", resetAt == null ? null : resetAt.toString());
        value.put("currentPeriodEnd", currentPeriodEnd == null ? null : currentPeriodEnd.toString());
        value.put("cancelAtPeriodEnd", cancelAtPeriodEnd);
        return value;
    }
}
