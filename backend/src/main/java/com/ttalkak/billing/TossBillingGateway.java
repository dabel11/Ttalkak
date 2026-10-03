package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

@Component
class TossBillingGateway implements BillingGateway {
    private final WebClient client;
    private final String secretKey;

    TossBillingGateway(WebClient.Builder builder,
            @Value("${ttalkak.billing.toss-secret-key:}") String secretKey) {
        this.client = builder.baseUrl("https://api.tosspayments.com").build();
        this.secretKey = secretKey;
    }

    private String authorization() {
        if (!secretKey.startsWith("test_sk_")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "BILLING_NOT_CONFIGURED",
                    "토스페이먼츠 테스트 시크릿 키가 필요합니다.");
        }
        return "Basic " + Base64.getEncoder().encodeToString((secretKey + ":")
                .getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public String issueBillingKey(String authKey, String customerKey) {
        try {
            BillingResponse response = client.post().uri("/v1/billing/authorizations/issue")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authorization())
                    .bodyValue(Map.of("authKey", authKey, "customerKey", customerKey))
                    .retrieve().bodyToMono(BillingResponse.class).block(Duration.ofSeconds(70));
            if (response == null || !customerKey.equals(response.customerKey())
                    || response.billingKey() == null || response.billingKey().isBlank()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_INVALID_RESPONSE", "카드 등록 응답을 확인할 수 없습니다.");
            }
            return response.billingKey();
        } catch (WebClientResponseException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_CARD_REGISTRATION_FAILED", "카드 등록에 실패했습니다.");
        }
    }

    @Override
    public Payment charge(String billingKey, String customerKey, String orderId, int amount) {
        try {
            return client.post().uri("/v1/billing/{billingKey}", billingKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authorization())
                    .header("Idempotency-Key", orderId)
                    .bodyValue(Map.of("customerKey", customerKey, "orderId", orderId,
                            "amount", amount, "orderName", "TTalkak PRO monthly"))
                    .retrieve().bodyToMono(Payment.class).block(Duration.ofSeconds(70));
        } catch (WebClientResponseException e) {
            if (e.getStatusCode().is4xxClientError()) {
                throw new BillingDeclinedException();
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN",
                    "결제 결과를 확인하지 못했습니다. 동일한 주문으로 다시 확인해야 합니다.");
        }
    }

    @Override
    public Payment lookup(String orderId) {
        try {
            return client.get().uri("/v1/payments/orders/{orderId}", orderId)
                    .header("Authorization", authorization())
                    .retrieve().bodyToMono(Payment.class).block(Duration.ofSeconds(70));
        } catch (WebClientResponseException.NotFound e) {
            return null;
        } catch (WebClientResponseException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN", "결제 조회에 실패했습니다.");
        }
    }

    private record BillingResponse(String billingKey, String customerKey) {}
}
