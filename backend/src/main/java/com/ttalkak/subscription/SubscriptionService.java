package com.ttalkak.subscription;

import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.Map;

@Service
public class SubscriptionService {
    private final UsageService usageService;
    private final BillingGateway billingGateway;

    public SubscriptionService(UsageService usageService, BillingGateway billingGateway) {
        this.usageService = usageService;
        this.billingGateway = billingGateway;
    }

    public Map<String, Object> current(Long memberId) {
        return Map.of("subscription", usageService.currentMember(memberId).toMap());
    }

    public Map<String, Object> checkout(Long memberId, String plan) {
        String normalizedPlan = String.valueOf(plan == null ? "PRO" : plan).trim().toUpperCase();
        if (!"PRO".equals(normalizedPlan)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SUBSCRIPTION_PLAN_INVALID", "지원하지 않는 요금제입니다.");
        }
        URI destination = billingGateway.createCheckout(memberId, normalizedPlan)
                .orElseThrow(() -> unavailable("결제 페이지"));
        return Map.of("checkoutUrl", requireHttps(destination));
    }

    public Map<String, Object> portal(Long memberId) {
        URI destination = billingGateway.createPortal(memberId)
                .orElseThrow(() -> unavailable("결제 관리"));
        return Map.of("portalUrl", requireHttps(destination));
    }

    private ApiException unavailable(String label) {
        return new ApiException(HttpStatus.NOT_IMPLEMENTED, "BILLING_PROVIDER_NOT_CONFIGURED", label + " 연동이 아직 설정되지 않았습니다.");
    }

    private String requireHttps(URI destination) {
        if (destination == null || !"https".equalsIgnoreCase(destination.getScheme()) || destination.getHost() == null) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_DESTINATION_INVALID", "결제 서비스가 올바른 HTTPS 주소를 반환하지 않았습니다.");
        }
        return destination.toString();
    }
}
