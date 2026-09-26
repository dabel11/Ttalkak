package com.ttalkak.subscription;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest(properties = "ttalkak.usage.free-daily-limit=3")
@Import({UsageService.class, UsageRowInitializer.class})
class MemberUsageConcurrencyIntegrationTest {
    @Autowired
    private UsageService usageService;

    @Test
    void concurrentFirstMemberRequestsRespectTheDailyAllowance() throws Exception {
        int requestCount = 5;
        ExecutorService executor = Executors.newFixedThreadPool(requestCount);
        CountDownLatch ready = new CountDownLatch(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<String>> futures = new ArrayList<>();
            for (int index = 0; index < requestCount; index += 1) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        usageService.consume(700L, null);
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

            assertEquals(3, outcomes.stream().filter("SUCCESS"::equals).count(), outcomes.toString());
            assertEquals(2, outcomes.stream().filter("DAILY_USAGE_LIMIT_EXCEEDED"::equals).count(), outcomes.toString());
        } finally {
            executor.shutdownNow();
        }
    }
}
