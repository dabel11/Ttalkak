package com.ttalkak.usage;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "ttalkak.usage.quota-enabled=true", "ttalkak.usage.free-token-limit=100",
        "ttalkak.usage.pro-token-limit=1000"
})
class MemberRequestGuardIntegrationTest {
    @Autowired MemberRequestGuard guard;
    @Autowired MemberRepository members;
    @Autowired MemberRequestLeaseRepository leases;
    @Autowired MemberTokenUsageService usage;
    @Autowired UsagePeriodService periods;
    @Autowired PaidUsagePeriodRepository paid;
    @Autowired PlatformTransactionManager manager;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;

    private Member member() {
        String key = UUID.randomUUID().toString().substring(0, 8);
        return members.saveAndFlush(new Member("quota_" + key, "password", "quota_" + key,
                "Quota test", null, null, null));
    }

    @Test void permitsAreIsolatedAndReleaseIsIdempotent() {
        Long first = member().getId(), second = member().getId();
        var one = guard.acquire(first);
        try {
            assertEquals("MEMBER_REQUEST_IN_PROGRESS", assertThrows(ApiException.class,
                    () -> guard.acquire(first)).getCode());
            var two = guard.acquire(second);
            guard.release(two);
        } finally { guard.release(one); }
        guard.release(one);
        var next = guard.acquire(first);
        guard.release(next);
        assertNull(guard.acquire(null));
    }

    @Test void concurrentWorkersOnlyAcquireOnePermit() throws Exception {
        Long id = member().getId();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<Object> task = () -> {
                start.await();
                try { return guard.acquire(id); } catch (ApiException error) { return error.getCode(); }
            };
            Future<Object> first = pool.submit(task), second = pool.submit(task);
            start.countDown();
            Object a = first.get(10, TimeUnit.SECONDS), b = second.get(10, TimeUnit.SECONDS);
            assertTrue((a instanceof MemberRequestGuard.Permit) != (b instanceof MemberRequestGuard.Permit));
            Object failed = a instanceof String ? a : b;
            assertEquals("MEMBER_REQUEST_IN_PROGRESS", failed);
            guard.release((MemberRequestGuard.Permit) (a instanceof MemberRequestGuard.Permit ? a : b));
        } finally { pool.shutdownNow(); }
    }

    @Test void consumedFreeQuotaBlocksButPaidPeriodGetsItsOwnAllowance() {
        Long id = member().getId();
        usage.record(id, "consumed", new TokenCounts(80, 30, 110), Instant.now().minusSeconds(1));
        var permit = guard.acquire(id);
        try {
            assertEquals("MEMBER_TOKEN_LIMIT_EXCEEDED", assertThrows(ApiException.class,
                    () -> guard.checkQuota(permit)).getCode());
            paid.saveAndFlush(new PaidUsagePeriod(id, UUID.randomUUID().toString(),
                    Instant.now().minusSeconds(10), Instant.now().plusSeconds(600)));
            assertDoesNotThrow(() -> guard.checkQuota(permit));
        } finally { guard.release(permit); }
    }

    @Test void missingAccountingPersistsAcrossReleaseAndAllowsOnlySavedReplayPath() {
        Long id = member().getId();
        var permit = guard.acquire(id);
        guard.usageMissing(permit);
        guard.release(permit);
        var next = guard.acquire(id); // replay lookup is possible before checkQuota
        try {
            assertEquals("MEMBER_USAGE_UNAVAILABLE", assertThrows(ApiException.class,
                    () -> guard.checkQuota(next)).getCode());
        } finally { guard.release(next); }
        assertTrue(guard.usageUncertain(id));
    }

    @Test void expiredWorkerCannotReleaseNewPermitAndExpiryMarksAccountingUncertain() {
        Long id = member().getId();
        Instant now = Instant.parse("2026-10-06T00:00:00Z");
        MemberRequestGuard old = at(now), later = at(now.plusSeconds(300));
        var one = old.acquire(id);
        var two = later.acquire(id);
        old.release(one);
        assertTrue(leases.findById(id).orElseThrow().owns(two.id()));
        try {
            assertEquals("MEMBER_USAGE_UNAVAILABLE", assertThrows(ApiException.class,
                    () -> later.checkQuota(two)).getCode());
        } finally { later.release(two); }
    }

    private MemberRequestGuard at(Instant time) {
        return new MemberRequestGuard(members, leases, periods, new MemberQuotaPolicy(true, 100, 1000),
                Clock.fixed(time, ZoneOffset.UTC), manager, Duration.ofSeconds(75));
    }

    @Test void endpointReturnsClampedRemainingAndUnknownUsageState() throws Exception {
        Member member = member();
        String token = auth.issueAccessToken(member);
        usage.record(member.getId(), "over", new TokenCounts(100, 50, 150), Instant.now().minusSeconds(1));
        mvc.perform(get("/api/me/usage").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.limit").value(100))
                .andExpect(jsonPath("$.used").value(150)).andExpect(jsonPath("$.remaining").value(0))
                .andExpect(jsonPath("$.limitReached").value(true)).andExpect(jsonPath("$.quotaEnforced").value(true));
        var permit = guard.acquire(member.getId());
        guard.usageMissing(permit);
        guard.release(permit);
        mvc.perform(get("/api/me/usage").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.usageAvailable").value(false))
                .andExpect(jsonPath("$.usageBlocked").value(true));
    }

    @Test void invalidConfigurationCannotSilentlyEnableUnlimitedQuota() {
        assertThrows(IllegalArgumentException.class, () -> new MemberQuotaPolicy(true, 0, 100));
        assertThrows(IllegalArgumentException.class, () -> new MemberQuotaPolicy(false, -1, 100));
        assertNull(new MemberQuotaPolicy(false, 0, 0).limit("FREE"));
    }
}
