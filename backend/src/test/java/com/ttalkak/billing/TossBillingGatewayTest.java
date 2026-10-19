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
    void timeoutKeepsPaymentUncertainAndCancelsTheProviderSubscription() throws InterruptedException {
        AtomicInteger cancelled = new AtomicInteger();
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request ->
                Mono.<ClientResponse>never().doOnCancel(cancelled::incrementAndGet)),
                "test_sk_example", Duration.ofMillis(50), Duration.ofSeconds(1));
        ApiException error = assertThrows(ApiException.class, () -> gateway.withinRequestBudget(() ->
                gateway.charge("test-billing", "customer", "same-order", 5000, "TTALKAK LIGHT monthly")));
        assertEquals("BILLING_UNCERTAIN", error.getCode());
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, error.getStatusCode());
        long cancellationDeadline = System.nanoTime() + Duration.ofSeconds(1).toNanos();
        while (cancelled.get() == 0 && System.nanoTime() < cancellationDeadline) Thread.sleep(5);
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
            return gateway.charge("test-billing", "customer", "same-order", 5000, "TTALKAK LIGHT monthly");
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
                    gateway.charge("test-billing", "customer", "same-order", 5000, "TTALKAK LIGHT monthly"));
            assertEquals("BILLING_UNCERTAIN", error.getCode());
        }
        assertThrows(BillingDeclinedException.class, () ->
                responding(HttpStatus.BAD_REQUEST, "INVALID_REJECT_CARD").charge("test-billing", "customer", "order", 5000, "TTALKAK LIGHT monthly"));
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

    @Test
    void configurationErrorsAreNotCustomerCardDeclines() {
        for (String code : new String[]{"INVALID_API_KEY", "UNAUTHORIZED_KEY",
                "INCORRECT_BASIC_AUTH_FORMAT", "KYC_BLOCKED"}) {
            ApiException error = assertThrows(ApiException.class, () ->
                    responding(HttpStatus.BAD_REQUEST, code)
                            .charge("billing", "customer", "order", 3900, "TTALKAK LIGHT monthly"));
            assertEquals("BILLING_PROVIDER_CONFIGURATION", error.getCode());
            assertFalse(error.getMessage().contains("private detail"));
        }
        ApiException error = assertThrows(ApiException.class, () ->
                responding(HttpStatus.UNAUTHORIZED)
                        .charge("billing", "customer", "order", 3900, "TTALKAK LIGHT monthly"));
        assertEquals("BILLING_PROVIDER_CONFIGURATION", error.getCode());
    }

    @Test
    void duplicateAndUnknownErrorsRequireReconciliation() {
        for (String code : new String[]{"DUPLICATED_ORDER_ID", "ALREADY_PROCESSED_PAYMENT",
                "PROVIDER_ERROR", "INVALID_REQUEST", "FUTURE_ERROR", ""}) {
            ApiException error = assertThrows(ApiException.class, () ->
                    responding(HttpStatus.BAD_REQUEST, code)
                            .charge("billing", "customer", "order", 3900, "TTALKAK LIGHT monthly"));
            assertEquals("BILLING_UNCERTAIN", error.getCode());
        }
    }

    @Test
    void serializesTierAndUpgradeNameWithOriginalOrderAndIdempotencyKey() {
        for (String name : new String[]{"TTALKAK LIGHT monthly", "TTALKAK STANDARD upgrade"}) {
            AtomicInteger calls = new AtomicInteger();
            var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request -> {
                assertEquals("same-order", request.headers().getFirst("Idempotency-Key"));
                var output = new org.springframework.mock.http.client.reactive.MockClientHttpRequest(
                        request.method(), request.url());
                return request.writeTo(output,
                        org.springframework.web.reactive.function.client.ExchangeStrategies.withDefaults())
                        .then(Mono.defer(output::getBodyAsString)).map(body -> {
                            calls.incrementAndGet();
                            assertTrue(body.contains("\"orderName\":\"" + name + "\""));
                            assertTrue(body.contains("\"amount\":3900"));
                            assertTrue(body.contains("\"orderId\":\"same-order\""));
                            return ClientResponse.create(HttpStatus.OK).header("Content-Type", "application/json")
                                    .body("{\"paymentKey\":\"payment\",\"orderId\":\"same-order\",\"status\":\"DONE\",\"type\":\"BILLING\",\"totalAmount\":3900}").build();
                        });
            }), "test_sk_example", Duration.ofSeconds(20), Duration.ofSeconds(60));
            assertEquals("DONE", gateway.charge("billing", "customer", "same-order", 3900, name).status());
            assertEquals(1, calls.get());
        }
    }

    @Test
    void cancelSendsPersistedIdempotencyKeyAndExplicitFullAmount() {
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request -> {
            assertEquals("/v1/payments/payment/cancel", request.url().getPath());
            assertEquals("refund-saved-key", request.headers().getFirst("Idempotency-Key"));
            var output = new org.springframework.mock.http.client.reactive.MockClientHttpRequest(request.method(), request.url());
            return request.writeTo(output, org.springframework.web.reactive.function.client.ExchangeStrategies.withDefaults())
                    .then(Mono.defer(output::getBodyAsString)).map(body -> {
                        assertTrue(body.contains("\"cancelAmount\":3900"));
                        assertTrue(body.contains("\"cancelReason\""));
                        return ClientResponse.create(HttpStatus.OK).header("Content-Type", "application/json")
                                .body("{\"paymentKey\":\"payment\",\"orderId\":\"order\",\"type\":\"BILLING\",\"status\":\"CANCELED\",\"totalAmount\":3900,\"balanceAmount\":0}").build();
                    });
        }), "test_sk_example", Duration.ofSeconds(20), Duration.ofSeconds(60));
        assertEquals(0L, gateway.cancel("payment", "refund-saved-key", 3900).balanceAmount().longValue());
        ApiException error = assertThrows(ApiException.class, () -> responding(HttpStatus.BAD_REQUEST,
                "ALREADY_CANCELED_PAYMENT").cancel("payment", "refund-saved-key", 3900));
        assertEquals("BILLING_REFUND_UNCERTAIN", error.getCode());
    }

    @Test
    void disabledProviderDoesNotStartEvenWithTestKeys() {
        AtomicInteger calls = new AtomicInteger();
        var gateway = new TossBillingGateway(WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet(); return Mono.never();
        }), "test_sk_example", Duration.ofSeconds(20), Duration.ofSeconds(60),
                new BillingContext("disabled", "test:legacy"));
        assertThrows(ApiException.class, () -> gateway.lookup("order"));
        assertEquals(0, calls.get());
    }

    private TossBillingGateway responding(HttpStatus status) {
        return responding(status, "");
    }

    private TossBillingGateway responding(HttpStatus status, String code) {
        return new TossBillingGateway(WebClient.builder().exchangeFunction(request ->
                Mono.just(ClientResponse.create(status).header("Content-Type", "application/json")
                        .body("{\"code\":\"" + code + "\",\"message\":\"private detail\"}").build())), "test_sk_example",
                Duration.ofSeconds(20), Duration.ofSeconds(60));
    }
}
