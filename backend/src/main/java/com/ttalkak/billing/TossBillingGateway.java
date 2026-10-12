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
import java.util.Set;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.function.Supplier;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.core.publisher.Mono;

@Component
class TossBillingGateway implements BillingGateway {
    private static final ObjectMapper ERROR_JSON = new ObjectMapper();
    // Only explicit card declines may close a pending order and stop renewal.
    private static final Set<String> CARD_DECLINES = Set.of(
            "INVALID_STOPPED_CARD", "INVALID_REJECT_CARD", "INVALID_CARD_LOST_OR_STOLEN",
            "INVALID_CARD_EXPIRATION", "INVALID_CARD_NUMBER", "NOT_SUPPORTED_CARD_TYPE",
            "NOT_REGISTERED_CARD_COMPANY", "REJECT_CARD_PAYMENT", "REJECT_CARD_COMPANY");
    private static final Set<String> CONFIGURATION_ERRORS = Set.of(
            "INVALID_API_KEY", "UNAUTHORIZED_KEY", "INCORRECT_BASIC_AUTH_FORMAT",
            "NOT_SUPPORTED_METHOD", "NOT_MATCHES_CUSTOMER_KEY", "KYC_BLOCKED");
    private final WebClient client;
    private final String secretKey;
    private final Duration providerTimeout;
    private final Duration requestBudget;
    private final java.util.function.LongSupplier nanoTime;
    private final ThreadLocal<Long> deadline = new ThreadLocal<>();

    @Autowired
    TossBillingGateway(WebClient.Builder builder,
            @Value("${ttalkak.billing.toss-secret-key:}") String secretKey,
            @Value("${ttalkak.billing.provider-timeout:20s}") Duration providerTimeout,
            @Value("${ttalkak.billing.request-budget:60s}") Duration requestBudget) {
        this(builder, secretKey, providerTimeout, requestBudget, System::nanoTime);
    }

    TossBillingGateway(WebClient.Builder builder, String secretKey, Duration providerTimeout,
                       Duration requestBudget, java.util.function.LongSupplier nanoTime) {
        this.client = builder.baseUrl("https://api.tosspayments.com").build();
        this.secretKey = secretKey;
        if (providerTimeout.isZero() || providerTimeout.isNegative()
                || requestBudget.isZero() || requestBudget.isNegative()
                || requestBudget.compareTo(Duration.ofSeconds(75)) > 0) {
            throw new IllegalArgumentException("Billing timeouts must be positive; request budget must not exceed 75s");
        }
        this.providerTimeout = providerTimeout;
        this.requestBudget = requestBudget;
        this.nanoTime = nanoTime;
    }

    @Override
    public <T> T withinRequestBudget(Supplier<T> operation) {
        if (deadline.get() != null) return operation.get();
        deadline.set(nanoTime.getAsLong() + requestBudget.toNanos());
        try {
            return operation.get();
        } finally {
            deadline.remove();
        }
    }

    private <T> T await(Mono<T> response, String code, String message) {
        Long end = deadline.get();
        long remaining = end == null ? requestBudget.toNanos() : end - nanoTime.getAsLong();
        if (remaining <= 0) throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, code, message);
        Duration timeout = Duration.ofNanos(Math.min(providerTimeout.toNanos(), remaining));
        return response.timeout(timeout)
                .onErrorMap(TimeoutException.class,
                        e -> new ApiException(HttpStatus.GATEWAY_TIMEOUT, code, message))
                .onErrorMap(WebClientRequestException.class,
                        e -> new ApiException(HttpStatus.BAD_GATEWAY, code, message))
                .block();
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
            BillingResponse response = await(client.post().uri("/v1/billing/authorizations/issue")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authorization())
                    .bodyValue(Map.of("authKey", authKey, "customerKey", customerKey))
                    .retrieve().bodyToMono(BillingResponse.class), "BILLING_CARD_REGISTRATION_UNCERTAIN",
                            "카드 등록 결과를 확인하지 못했습니다. 결제 상태를 먼저 확인해 주세요.");
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
    public Payment charge(String billingKey, String customerKey, String orderId, int amount, String orderName) {
        try {
            return await(client.post().uri("/v1/billing/{billingKey}", billingKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authorization())
                    .header("Idempotency-Key", orderId)
                    .bodyValue(Map.of("customerKey", customerKey, "orderId", orderId,
                            "amount", amount, "orderName", orderName))
                    .retrieve().bodyToMono(Payment.class), "BILLING_UNCERTAIN",
                            "결제 결과를 확인하지 못했습니다. 같은 주문으로 재확인해야 합니다.");
        } catch (WebClientResponseException e) {
            String providerCode = providerErrorCode(e);
            if (e.getStatusCode().is4xxClientError()
                    && e.getStatusCode().value() != 408 && e.getStatusCode().value() != 429) {
                if (CARD_DECLINES.contains(providerCode)) throw new BillingDeclinedException();
                if (e.getStatusCode().value() == 401 || CONFIGURATION_ERRORS.contains(providerCode)) {
                    throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "BILLING_PROVIDER_CONFIGURATION",
                            "결제 서비스 설정을 확인해야 합니다. 관리자에게 문의해 주세요.");
                }
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN",
                    "결제 결과를 확인하지 못했습니다. 동일한 주문으로 다시 확인해야 합니다.");
        }
    }

    @Override
    public Payment lookup(String orderId) {
        try {
            return await(client.get().uri("/v1/payments/orders/{orderId}", orderId)
                    .header("Authorization", authorization())
                    .retrieve().bodyToMono(Payment.class), "BILLING_UNCERTAIN",
                            "결제 결과를 확인하지 못했습니다. 같은 주문으로 재확인해야 합니다.");
        } catch (WebClientResponseException.NotFound e) {
            return null;
        } catch (WebClientResponseException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN", "결제 조회에 실패했습니다.");
        }
    }

    private String providerErrorCode(WebClientResponseException error) {
        try {
            // Never expose provider bodies or messages, which may contain sensitive data.
            return ERROR_JSON.readTree(error.getResponseBodyAsString()).path("code").asText("");
        } catch (Exception ignored) {
            return "";
        }
    }

    private record BillingResponse(String billingKey, String customerKey) {}
}
