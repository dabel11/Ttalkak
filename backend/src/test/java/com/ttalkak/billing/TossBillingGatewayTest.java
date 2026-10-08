package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class TossBillingGatewayTest {
    @Test
    void timeoutKeepsPaymentUncertainAndCancelsTheProviderSubscription() {
        AtomicInteger cancelled = new AtomicInteger();
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request ->
                Mono.<ClientResponse>never().doOnCancel(cancelled::incrementAndGet)),
                "test_sk_example", Duration.ofMillis(50), Duration.ofSeconds(1));
        ApiException error = assertThrows(ApiException.class, () -> gateway.withinRequestBudget(() ->
                gateway.charge("test-billing", "customer", "same-order", 5000)));
        assertEquals("BILLING_UNCERTAIN", error.getCode());
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, error.getStatusCode());
        assertEquals(1, cancelled.get());
    }

    @Test
    void cardIssuanceAndChargeShareOneDeadlineAndTheNextRequestGetsAFreshBudget() {
        AtomicLong nanoTime = new AtomicLong();
        AtomicInteger providerCalls = new AtomicInteger();
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request -> {
            providerCalls.incrementAndGet();
            if (request.url().getPath().endsWith("/authorizations/issue")) {
                return Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header("Content-Type", "application/json")
                        .body("{\"billingKey\":\"test-billing\",\"customerKey\":\"customer\"}").build());
            }
            return Mono.just(ClientResponse.create(HttpStatus.NOT_FOUND).build());
        }), "test_sk_example", Duration.ofSeconds(20), Duration.ofSeconds(60), nanoTime::get);
        ApiException error = assertThrows(ApiException.class, () -> gateway.withinRequestBudget(() -> {
            assertEquals("test-billing", gateway.issueBillingKey("auth", "customer"));
            nanoTime.set(Duration.ofSeconds(61).toNanos());
            return gateway.charge("test-billing", "customer", "same-order", 5000);
        }));
        assertEquals("BILLING_UNCERTAIN", error.getCode());
        assertEquals(1, providerCalls.get(), "Expired budget must not start another provider request");
        assertNull(gateway.withinRequestBudget(() -> gateway.lookup("same-order")));
        assertEquals(2, providerCalls.get(), "Budget must be removed even after an exception");
    }

    @Test
    void rateLimitAndRequestTimeoutAreUncertainWhileDefinitiveDeclineIsRejected() {
        for (HttpStatus status : new HttpStatus[]{HttpStatus.REQUEST_TIMEOUT,
                HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR}) {
            var gateway = responding(status);
            ApiException error = assertThrows(ApiException.class, () ->
                    gateway.charge("test-billing", "customer", "same-order", 5000));
            assertEquals("BILLING_UNCERTAIN", error.getCode());
        }
        assertThrows(BillingDeclinedException.class, () ->
                responding(HttpStatus.BAD_REQUEST).charge("test-billing", "customer", "order", 5000));
    }

    @Test
    void cardIssuanceTimeoutIsNotReportedAsAConfirmedDecline() {
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request -> Mono.never()),
                "test_sk_example", Duration.ofMillis(50), Duration.ofSeconds(1));
        ApiException error = assertThrows(ApiException.class, () -> gateway.issueBillingKey("auth", "customer"));
        assertEquals("BILLING_CARD_REGISTRATION_UNCERTAIN", error.getCode());
    }

    @Test
    void configurationCannotIncreaseTheBudgetBeyondTheWebTimeoutMargin() {
        assertThrows(IllegalArgumentException.class, () -> new TossBillingGateway(WebClient.builder(),
                "test_sk_example", Duration.ofSeconds(20), Duration.ofSeconds(90)));
    }

    private TossBillingGateway responding(HttpStatus status) {
        return new TossBillingGateway(WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(status).build())), "test_sk_example",
                Duration.ofSeconds(20), Duration.ofSeconds(60));
    }
}
