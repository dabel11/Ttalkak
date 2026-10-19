package com.ttalkak.usage;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.time.YearMonth;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
})
class MemberTokenUsageServiceIntegrationTest {
    @Autowired
    private MemberTokenUsageService service;

    @Test
    void recordsOnceAndRejectsConflictingReplay() {
        long memberId = Math.abs(UUID.randomUUID().getMostSignificantBits() % 1_000_000) + 1;
        String key = UUID.randomUUID().toString();
        Instant time = Instant.parse("2026-09-26T10:00:00Z");
        TokenCounts counts = new TokenCounts(100, 20, 120);

        service.record(memberId, key, counts, time);
        service.record(memberId, key, counts, time.plusSeconds(1));
        assertEquals(new MemberTokenUsageService.Totals(100, 20, 120, 1),
                service.sumKstMonth(memberId, YearMonth.of(2026, 9)));

        ApiException conflict = assertThrows(ApiException.class,
                () -> service.record(memberId, key, new TokenCounts(101, 20, 121), time));
        assertEquals("TOKEN_USAGE_REQUEST_CONFLICT", conflict.getCode());
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(1, service.sumKstMonth(memberId, YearMonth.of(2026, 9)).requests());
    }

    @Test
    void separatesCalendarMonthsAtMidnightInSeoul() {
        long memberId = Math.abs(UUID.randomUUID().getLeastSignificantBits() % 1_000_000) + 1;
        service.record(memberId, UUID.randomUUID().toString(), new TokenCounts(20, 5, 25),
                Instant.parse("2026-09-30T14:59:59Z")); // Sep 30, 23:59:59 KST
        service.record(memberId, UUID.randomUUID().toString(), new TokenCounts(40, 10, 50),
                Instant.parse("2026-09-30T15:00:00Z")); // Oct 1, 00:00:00 KST

        assertEquals(25, service.sumKstMonth(memberId, YearMonth.of(2026, 9)).totalTokens());
        assertEquals(50, service.sumKstMonth(memberId, YearMonth.of(2026, 10)).totalTokens());
        assertEquals(75, service.sum(memberId,
                Instant.parse("2026-09-30T14:59:59Z"),
                Instant.parse("2026-09-30T15:00:01Z")).totalTokens());
    }
}
