package com.ttalkak.subscription;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest
@Import({UsageService.class, UsageRowInitializer.class})
class UsageServiceIntegrationTest {
    @Autowired
    private UsageService usageService;

    @Test
    void guestAllowanceIsPersistedAndRejectedAfterThreeRequests() {
        String sessionUuid = UUID.randomUUID().toString();
        assertEquals(2, usageService.consume(null, sessionUuid).remainingToday());
        assertEquals(1, usageService.consume(null, sessionUuid).remainingToday());
        assertEquals(0, usageService.consume(null, sessionUuid).remainingToday());

        ApiException exception = assertThrows(ApiException.class, () -> usageService.consume(null, sessionUuid));
        assertEquals("FREE_TRIAL_LIMIT_EXCEEDED", exception.getCode());
        assertTrue(exception.getDetails().containsKey("usage"));
    }

    @Test
    void memberAllowanceUsesFreeAndActiveProLimits() {
        Long memberId = 77L;
        UsageEntitlement free = usageService.consume(memberId, null);
        assertEquals("FREE", free.plan());
        assertEquals(10, free.dailyLimit());
        assertEquals(9, free.remainingToday());

        UsageEntitlement pro = usageService.applySubscription(
                memberId, "PRO", "ACTIVE", LocalDateTime.now().plusMonths(1), false
        );
        assertEquals(100, pro.dailyLimit());
        assertEquals(98, usageService.consume(memberId, null).remainingToday());
    }

    @Test
    void pastDueSubscriptionBlocksUsageWithCurrentEntitlement() {
        Long memberId = 88L;
        usageService.applySubscription(memberId, "PRO", "PAST_DUE", LocalDateTime.now().plusDays(2), false);
        ApiException exception = assertThrows(ApiException.class, () -> usageService.consume(memberId, null));
        assertEquals("SUBSCRIPTION_PAST_DUE", exception.getCode());
        assertTrue(exception.getDetails().containsKey("usage"));
    }

    @Test
    void endedCancellationPeriodFallsBackToFreeAccess() {
        Long memberId = 99L;
        UsageEntitlement entitlement = usageService.applySubscription(
                memberId, "PRO", "CANCELED", LocalDateTime.now().minusMinutes(1), true
        );

        assertEquals("EXPIRED", entitlement.status());
        assertEquals(10, entitlement.dailyLimit());
        assertFalse(entitlement.cancelAtPeriodEnd());
    }

    @Test
    void concurrentFirstGuestRequestsRespectTheTotalAllowance() throws Exception {
        String sessionUuid = UUID.randomUUID().toString();
        List<String> outcomes = runConcurrently(5, () -> usageService.consume(null, sessionUuid));

        assertEquals(3, outcomes.stream().filter("SUCCESS"::equals).count(), outcomes.toString());
        assertEquals(2, outcomes.stream().filter("FREE_TRIAL_LIMIT_EXCEEDED"::equals).count(), outcomes.toString());
    }

    private List<String> runConcurrently(int count, ThrowingCall call) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(count);
        CountDownLatch ready = new CountDownLatch(count);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<String>> futures = new ArrayList<>();
            for (int index = 0; index < count; index += 1) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        call.run();
                        return "SUCCESS";
                    } catch (ApiException exception) {
                        return exception.getCode();
                    } catch (RuntimeException exception) {
                        return exception.getClass().getSimpleName();
                    }
                }));
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            List<String> outcomes = new ArrayList<>();
            for (Future<String> future : futures) outcomes.add(future.get(10, TimeUnit.SECONDS));
            return outcomes;
        } finally {
            executor.shutdownNow();
        }
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run();
    }
}
