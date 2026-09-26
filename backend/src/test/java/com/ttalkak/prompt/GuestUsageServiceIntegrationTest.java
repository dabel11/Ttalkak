package com.ttalkak.prompt;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
})
class GuestUsageServiceIntegrationTest {
    @Autowired
    private GuestUsageService service;

    @Autowired
    private GuestUsageRepository repository;

    @Autowired
    private GuestUsageReservationRepository reservations;

    @Test
    void allowsThreeSuccessfulRequestsAndRejectsFourth() {
        String session = UUID.randomUUID().toString();
        String hash = null;
        for (int i = 0; i < 3; i++) {
            GuestUsageService.Permit permit = service.reserve(session);
            hash = permit.sessionUuidHash();
            service.complete(permit);
            service.complete(permit); // A repeated settlement must not consume another slot.
        }

        ApiException denied = assertThrows(ApiException.class, () -> service.reserve(session));
        assertEquals(429, denied.getStatusCode().value());
        assertEquals("FREE_TRIAL_LIMIT_EXCEEDED", denied.getCode());
        assertEquals(3, repository.findById(hash).orElseThrow().getUsageCount());
        service.complete(service.reserve(UUID.randomUUID().toString()));
    }

    @Test
    void failedRequestReleasesSlotAndConcurrentReservationsCannotExceedThree() throws Exception {
        String session = UUID.randomUUID().toString();
        GuestUsageService.Permit failed = service.reserve(session);
        service.release(failed);

        int callers = 8;
        ExecutorService pool = Executors.newFixedThreadPool(callers);
        CountDownLatch ready = new CountDownLatch(callers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<GuestUsageService.Permit>> results = new ArrayList<>();
        try {
            for (int i = 0; i < callers; i++) {
                results.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        return service.reserve(session);
                    } catch (ApiException denied) {
                        assertEquals("FREE_TRIAL_LIMIT_EXCEEDED", denied.getCode());
                        return null;
                    }
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<GuestUsageService.Permit> granted = new ArrayList<>();
            for (Future<GuestUsageService.Permit> result : results) {
                GuestUsageService.Permit permit = result.get(15, TimeUnit.SECONDS);
                if (permit != null) granted.add(permit);
            }
            assertEquals(3, granted.size());
            for (GuestUsageService.Permit permit : granted) service.complete(permit);
            assertEquals(429, assertThrows(ApiException.class,
                    () -> service.reserve(session)).getStatusCode().value());
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void requiresValidSessionHeader() {
        assertEquals("SESSION_UUID_REQUIRED",
                assertThrows(ApiException.class, () -> service.reserve(null)).getCode());
        assertEquals("SESSION_UUID_INVALID",
                assertThrows(ApiException.class, () -> service.reserve("bad!\nvalue")).getCode());
    }

    @Test
    void abandonedReservationIsReclaimedOnNextRequest() {
        String session = UUID.randomUUID().toString();
        GuestUsageService.Permit abandoned = service.reserve(session);
        GuestUsageReservation reservation = reservations.findById(abandoned.reservationId()).orElseThrow();
        ReflectionTestUtils.setField(reservation, "expiresAt", Instant.now().minusSeconds(1));
        reservations.saveAndFlush(reservation);

        for (int i = 0; i < 3; i++) service.complete(service.reserve(session));

        assertEquals(3, repository.findById(abandoned.sessionUuidHash()).orElseThrow().getUsageCount());
        assertEquals(0, repository.findById(abandoned.sessionUuidHash()).orElseThrow().getReservedCount());
        service.complete(abandoned); // Late response cannot charge a reclaimed reservation.
        assertEquals(3, repository.findById(abandoned.sessionUuidHash()).orElseThrow().getUsageCount());
    }
}
