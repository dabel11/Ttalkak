package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Locale;

/** Server-owned test prices; the browser can only select an identifier. */
public enum BillingPlan {
    LIGHT(3900, 30),
    STANDARD(5900, 70),
    PRO(9900, 150);

    private final int amount;
    private final int monthlyRequests;

    BillingPlan(int amount, int monthlyRequests) {
        this.amount = amount;
        this.monthlyRequests = monthlyRequests;
    }

    public int amount() { return amount; }
    public int monthlyRequests() { return monthlyRequests; }

    public static BillingPlan parse(String code) {
        if (code == null || code.isBlank()) return PRO; // legacy callers
        try {
            return valueOf(code.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BILLING_PLAN_INVALID",
                    "선택한 요금제를 확인해 주세요.");
        }
    }
}
