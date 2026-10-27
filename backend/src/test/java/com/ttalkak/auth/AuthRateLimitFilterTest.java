package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class AuthRateLimitFilterTest {
    @Test void limitsRequestsSeparatelyAndAllowsNextWindow() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        for (int i=0; i<10; i++) assertTrue(filter.allow("ip", "/api/auth/password-reset/request", 1000));
        assertFalse(filter.allow("ip", "/api/auth/password-reset/request", 1000));
        assertTrue(filter.allow("other", "/api/auth/password-reset/request", 1000));
        assertTrue(filter.allow("ip", "/api/auth/login", 1000));
        assertTrue(filter.allow("ip", "/api/auth/password-reset/request", 61000));
    }
    @Test void rejectedRequestReturnsStructured429AndDoesNotReachController() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        for (int i=0; i<10; i++) filter.allow("127.0.0.1", "/api/auth/password-reset/request", System.currentTimeMillis());
        var request = new MockHttpServletRequest("POST", "/api/auth/password-reset/request");
        request.setRemoteAddr("127.0.0.1");
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (a, b) -> fail("controller should not run"));
        assertEquals(429, response.getStatus());
        assertEquals("60", response.getHeader("Retry-After"));
        assertTrue(response.getContentAsString().contains("AUTH_RATE_LIMITED"));
    }
    @Test void emailIdRecoveryEndpointRejectsEleventhRequestBeforeDispatch() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        int reached = 0;
        for (int i = 0; i < 11; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/id-recovery/request");
            request.setRemoteAddr("198.51.100.44");
            var response = new MockHttpServletResponse();
            var counter = new java.util.concurrent.atomic.AtomicBoolean();
            filter.doFilter(request, response, (req, resp) -> counter.set(true));
            if (i < 10) {
                assertTrue(counter.get(), "requests inside per-IP window should reach the dispatcher");
                reached++;
            } else {
                assertFalse(counter.get(), "rate limited request must not reach the mail dispatcher");
                assertEquals(429, response.getStatus());
                assertEquals("60", response.getHeader("Retry-After"));
                assertTrue(response.getContentAsString().contains("AUTH_RATE_LIMITED"));
            }
        }
        assertEquals(10, reached);
    }

    @Test void concurrentEmailRecoveryRequestsRespectSingleInstanceLimit() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        var pool = java.util.concurrent.Executors.newFixedThreadPool(12);
        var start = new java.util.concurrent.CountDownLatch(1);
        var tasks = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
        try {
            for (int i = 0; i < 12; i++) {
                tasks.add(pool.submit(() -> {
                    start.await();
                    return filter.allow("198.51.100.55", "/api/auth/id-recovery/request", 1000) ? 1 : 0;
                }));
            }
            start.countDown();
            int accepted = 0;
            for (var task : tasks) accepted += task.get(10, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(10, accepted, "concurrent requests must not exceed the per-IP window");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test void expiredKeyResetsEvenBetweenPeriodicCleanupPasses() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        var endpoint = "/api/auth/id-recovery/request";
        for (int i = 0; i < 10; i++) {
            assertTrue(filter.allow("198.51.100.9", endpoint, 1_000));
        }
        assertFalse(filter.allow("198.51.100.9", endpoint, 1_000));
        // A separate request triggers cleanup shortly before the first key expires.
        assertTrue(filter.allow("198.51.100.10", endpoint, 60_900));
        // The next request arrives within the cleanup interval, but this key has expired.
        assertTrue(filter.allow("198.51.100.9", endpoint, 61_000));
    }

    @Test void mixedLegitimateAndHostileDistinctAddressesDoNotExhaustCapacity() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String path = "/api/auth/id-recovery/request";
        String legitimate = "192.0.2.45";
        assertTrue(filter.allow(legitimate, path, 1_000));
        // More than the former 10,000-key hard limit: each hostile key is distinct.
        for (int i = 0; i < 20_000; i++) {
            assertTrue(filter.allow("attacker-" + i, path, 1_000),
                    "new identities should not be rejected by global map capacity");
        }
        for (int i = 1; i < 10; i++) {
            assertTrue(filter.allow(legitimate, path, 1_000),
                    "the legitimate client retains its original quota during the flood");
        }
        assertFalse(filter.allow(legitimate, path, 1_000));
        assertTrue(filter.allow("new-legitimate-after-flood", path, 1_000));
    }

    @Test void sameAddressCannotResetItsQuotaByFloodingNewKeys() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String path = "/api/auth/id-recovery/request";
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("203.0.113.8", path, 1_000));
        for (int i = 0; i < 20_000; i++) {
            filter.allow("rotating-" + i, path, 1_000);
        }
        assertFalse(filter.allow("203.0.113.8", path, 1_000),
                "identity floods must not evict existing counters");
        assertTrue(filter.allow("203.0.113.8", path, 61_000),
                "expired counters can be used again");
    }

    @Test void nonAuthRequestsBypassLimiterAfterHighIdentityChurn() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        for (int i = 0; i < 20_000; i++) filter.allow("rotating-" + i, "/api/auth/login", 1_000);
        var request = new MockHttpServletRequest("GET", "/api/auth/login");
        request.setRemoteAddr("203.0.113.200");
        var response = new MockHttpServletResponse();
        var reached = new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(request, response, (req, resp) -> reached.set(true));
        assertTrue(reached.get());
    }

    @Test void allSketchRowsShareTheSameFixedMinuteBoundary() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String path = "/api/auth/id-recovery/request";
        // Start near the boundary. Counts must be uniform across the four rows,
        // rather than each colliding slot expiring at an unrelated time.
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("192.0.2.90", path, 59_900));
        assertFalse(filter.allow("192.0.2.90", path, 59_999));
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("192.0.2.90", path, 60_000));
        assertFalse(filter.allow("192.0.2.90", path, 60_001));
    }

    @Test void highChurnAcrossMinuteBoundaryDoesNotCarryOldSketchCounts() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        var endpoint = "/api/auth/id-recovery/request";
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("192.0.2.18", endpoint, 1000));
        assertFalse(filter.allow("192.0.2.18", endpoint, 1000));
        for (int i = 0; i < 25_000; i++) {
            assertTrue(filter.allow("churn-" + i, endpoint, 61_001),
                    "expired sketch slots should not carry old budgets into new window");
        }
        assertTrue(filter.allow("192.0.2.18", endpoint, 61_001));
    }

    @Test void stableIdentityStillThrottledAfterManyRequestsOnOtherEndpoints() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String recovery = "/api/auth/id-recovery/request";
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("192.0.2.99", recovery, 1_000));
        // A separate endpoint has a higher quota; unrelated traffic must not
        // reset the recovery endpoint's already-exhausted budget.
        for (int i = 0; i < 30; i++) {
            assertTrue(filter.allow("192.0.2.99", "/api/auth/login", 1_000));
        }
        assertFalse(filter.allow("192.0.2.99", recovery, 1_000));
        assertFalse(filter.allow("192.0.2.99", "/api/auth/login", 1_000));
        assertTrue(filter.allow("192.0.2.99", recovery, 61_000));
    }

    @Test void rejectedRequestsDoNotIncrementOrResetTheirOwnSketchBudget() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String endpoint = "/api/auth/find-id";
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("192.0.2.14", endpoint, 2_000));
        for (int i = 0; i < 1_000; i++) assertFalse(filter.allow("192.0.2.14", endpoint, 2_000));
        assertTrue(filter.allow("192.0.2.14", endpoint, 62_000));
    }

    @Test void javaStringHashCollisionDoesNotShareIdentityBudget() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String path = "/api/auth/id-recovery/request";
        assertEquals("Aa".hashCode(), "BB".hashCode(), "fixture is a known Java String hash collision");
        for (int i = 0; i < 10; i++) assertTrue(filter.allow("Aa", path, 1_000));
        assertFalse(filter.allow("Aa", path, 1_000));
        for (int i = 0; i < 10; i++) {
            assertTrue(filter.allow("BB", path, 1_000),
                    "keyed hash must not correlate user quotas by String.hashCode()");
        }
        assertFalse(filter.allow("BB", path, 1_000));
    }

    @Test void concurrentHostileIdentityChurnDoesNotResetLegitimateClientQuota() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String path = "/api/auth/id-recovery/request";
        var pool = java.util.concurrent.Executors.newFixedThreadPool(9);
        var start = new java.util.concurrent.CountDownLatch(1);
        var tasks = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
        try {
            for (int worker = 0; worker < 8; worker++) {
                int group = worker;
                tasks.add(pool.submit(() -> {
                    start.await();
                    int accepted = 0;
                    for (int i = 0; i < 2_000; i++) {
                        if (filter.allow("hostile-" + group + "-" + i, path, 1000)) accepted++;
                    }
                    return accepted;
                }));
            }
            tasks.add(pool.submit(() -> {
                start.await();
                int accepted = 0;
                for (int i = 0; i < 12; i++) {
                    if (filter.allow("stable-legitimate", path, 1000)) accepted++;
                }
                return accepted;
            }));
            start.countDown();
            for (int i = 0; i < 8; i++) {
                assertEquals(2_000, tasks.get(i).get(30, java.util.concurrent.TimeUnit.SECONDS));
            }
            assertEquals(10, tasks.get(8).get(30, java.util.concurrent.TimeUnit.SECONDS),
                    "legitimate client remains limited but not locked out by distinct hostile keys");
            assertFalse(filter.allow("stable-legitimate", path, 1000));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test void forwardedHeaderWrappingCannotChangeSocketPeerThrottleKey() throws Exception {
        var limiter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        var forwarding = new org.springframework.web.filter.ForwardedHeaderFilter();
        var accepted = new java.util.concurrent.atomic.AtomicInteger();
        for (int i = 0; i < 11; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/id-recovery/request");
            request.setRemoteAddr("198.51.100.100");
            request.addHeader("X-Forwarded-For", "203.0.113." + i + ", 198.51.100.100");
            var response = new MockHttpServletResponse();
            forwarding.doFilter(request, response,
                    (req, resp) -> limiter.doFilter(req, resp, (a, b) -> accepted.incrementAndGet()));
            if (i == 10) assertEquals(429, response.getStatus());
        }
        assertEquals(10, accepted.get(),
                "forwarded spoofing must not reset the socket peer rate limit");
    }

    @Test void attestedProxyUsesClientIpForIndependentRateLimits() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters");
        var accepted = new java.util.concurrent.atomic.AtomicInteger();
        for (int i = 0; i < 11; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/id-recovery/request");
            request.setRemoteAddr("10.0.0.20");
            request.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
            request.addHeader("X-Ttalkak-Client-IP", "203.0.113.7");
            request.addHeader("X-Forwarded-For", "198.51.100." + i);
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, resp) -> accepted.incrementAndGet());
            if (i == 10) assertEquals(429, response.getStatus());
        }
        assertEquals(10, accepted.get());
        var different = new MockHttpServletRequest("POST", "/api/auth/id-recovery/request");
        different.setRemoteAddr("10.0.0.20");
        different.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        different.addHeader("X-Ttalkak-Client-IP", "203.0.113.8");
        var response = new MockHttpServletResponse();
        filter.doFilter(different, response, (req, resp) -> accepted.incrementAndGet());
        assertEquals(11, accepted.get(), "distinct attested users should not share a proxy bucket");
    }

    @Test void forgedOrInvalidProxyAttestationFallsBackToSocketPeer() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters");
        for (String ip : new String[]{"203.0.113.1", "203.0.113.2, 192.0.2.1",
                "127.0.0.1.example.com", "999.0.0.1", "2001:db8::zz"}) {
            var request = new MockHttpServletRequest("POST", "/api/auth/login");
            request.setRemoteAddr("10.0.0.20");
            request.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
            request.addHeader("X-Ttalkak-Client-IP", ip);
            if (!ip.equals("203.0.113.1")) assertEquals("10.0.0.20", filter.clientKey(request));
            else assertEquals(ip, filter.clientKey(request));
            var forged = new MockHttpServletRequest("POST", "/api/auth/login");
            forged.setRemoteAddr("10.0.0.20");
            forged.addHeader("X-Ttalkak-Proxy-Secret", "forged-client-value");
            forged.addHeader("X-Ttalkak-Client-IP", ip);
            assertEquals("10.0.0.20", filter.clientKey(forged));
        }
    }

    @Test void duplicateProxyAttestationHeadersNeverAuthorizeAClientIdentity() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters", true);
        var duplicateSecret = new MockHttpServletRequest("POST", "/api/auth/login");
        duplicateSecret.setRemoteAddr("10.0.0.20");
        duplicateSecret.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        duplicateSecret.addHeader("X-Ttalkak-Proxy-Secret", "attacker-value");
        duplicateSecret.addHeader("X-Ttalkak-Client-IP", "203.0.113.7");
        assertNull(filter.clientKey(duplicateSecret));

        var duplicateIp = new MockHttpServletRequest("POST", "/api/auth/login");
        duplicateIp.setRemoteAddr("10.0.0.20");
        duplicateIp.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        duplicateIp.addHeader("X-Ttalkak-Client-IP", "203.0.113.7");
        duplicateIp.addHeader("X-Ttalkak-Client-IP", "203.0.113.8");
        assertNull(filter.clientKey(duplicateIp));

        var combined = new MockHttpServletRequest("POST", "/api/auth/login");
        combined.setRemoteAddr("10.0.0.20");
        combined.addHeader("X-Ttalkak-Proxy-Secret",
                "this-is-a-long-test-secret-over-32-characters, forged");
        combined.addHeader("X-Ttalkak-Client-IP", "203.0.113.7");
        assertNull(filter.clientKey(combined));
    }

    @Test void canonicalIpv6AttestationCannotSplitRateLimitBuckets() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters");
        var first = new MockHttpServletRequest("POST", "/api/auth/login");
        first.setRemoteAddr("10.0.0.20");
        first.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        first.addHeader("X-Ttalkak-Client-IP", "2001:db8::1");
        var alternate = new MockHttpServletRequest("POST", "/api/auth/login");
        alternate.setRemoteAddr("10.0.0.20");
        alternate.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        alternate.addHeader("X-Ttalkak-Client-IP", "2001:0DB8:0000:0:0:0:0:1");
        assertEquals(filter.clientKey(first), filter.clientKey(alternate));
    }

    @Test void proxyRequiredModeFailsStartupWithoutStrongSecret() {
        var writer = new ApiErrorWriter(new ObjectMapper().findAndRegisterModules());
        assertThrows(IllegalStateException.class, () -> new AuthRateLimitFilter(writer, "", true));
        assertThrows(IllegalStateException.class, () -> new AuthRateLimitFilter(writer, "short", true));
        assertThrows(IllegalStateException.class, () ->
                new AuthRateLimitFilter(writer, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\";", true));
    }

    @Test void proxyRequiredModeRejectsUnauthenticatedDirectAuthRequests() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters", true);
        for (String forgedIp : new String[]{ "203.0.113.1", "198.51.100.8" }) {
            var request = new MockHttpServletRequest("POST", "/api/auth/login");
            request.setRemoteAddr("198.51.100.100");
            request.addHeader("X-Forwarded-For", forgedIp);
            request.addHeader("X-Ttalkak-Client-IP", forgedIp);
            request.addHeader("X-Ttalkak-Proxy-Secret", "wrong");
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (a, b) -> fail("untrusted requests must not reach auth"));
            assertEquals(503, response.getStatus());
            assertTrue(response.getContentAsString().contains("AUTH_PROXY_REQUIRED"));
        }
    }

    @Test void proxyRequiredModeAllowsAuthenticatedProxyWithValidIp() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()),
                "this-is-a-long-test-secret-over-32-characters", true);
        var request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setRemoteAddr("10.0.0.20");
        request.addHeader("X-Ttalkak-Client-IP", "203.0.113.1");
        request.addHeader("X-Ttalkak-Proxy-Secret", "this-is-a-long-test-secret-over-32-characters");
        var response = new MockHttpServletResponse();
        var passed = new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(request, response, (a, b) -> passed.set(true));
        assertTrue(passed.get());
    }

    @Test void spoofedForwardedForHeaderDoesNotResetDirectFilterRateLimit() throws Exception {
        // This tests only the filter's direct request handling. It does not
        // prove that Railway / Spring proxy configuration provides true client IPs.
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        var reached = new java.util.concurrent.atomic.AtomicInteger();
        for (int i = 0; i < 11; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/password-reset/request");
            request.setRemoteAddr("198.51.100.10");
            request.addHeader("X-Forwarded-For", "203.0.113." + i);
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, resp) -> reached.incrementAndGet());
            if (i == 10) {
                assertEquals(429, response.getStatus());
                assertEquals("60", response.getHeader("Retry-After"));
            }
        }
        assertEquals(10, reached.get(), "Untrusted X-Forwarded-For must not bypass a direct filter instance");
    }

}
