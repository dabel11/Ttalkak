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

    @Test void exhaustedKeySpaceStillEnforcesLimitsForPreviouslyTrackedClients() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String endpoint = "/api/auth/id-recovery/request";
        assertTrue(filter.allow("198.51.100.1", endpoint, 1_000));
        for (int i = 1; i < 10_000; i++) {
            assertTrue(filter.allow("198.51." + (i / 256) + "." + (i % 256), endpoint, 1_000));
        }
        for (int i = 1; i < 10; i++) {
            assertTrue(filter.allow("198.51.100.1", endpoint, 1_000));
        }
        assertFalse(filter.allow("198.51.100.1", endpoint, 1_000),
                "capacity exhaustion must not reset existing account recovery throttles");
        assertFalse(filter.allow("203.0.113.200", endpoint, 1_000),
                "an untracked client is denied when memory reaches its bound");
    }

    @Test void nonAuthRequestsBypassAuthenticationLimiterAtKeyCapacity() throws Exception {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        for (int i = 0; i < 10_000; i++) {
            assertTrue(filter.allow("198.51." + (i / 256) + "." + (i % 256),
                    "/api/auth/login", 1_000));
        }
        var getRequest = new MockHttpServletRequest("GET", "/api/auth/login");
        getRequest.setRemoteAddr("203.0.113.200");
        var response = new MockHttpServletResponse();
        var passed = new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(getRequest, response, (req, resp) -> passed.set(true));
        assertTrue(passed.get(), "limiter must not affect methods outside its POST contract");
    }

    @Test void keyCapacityExhaustionRejectsNewClientsUntilTheWindowExpires() {
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper().findAndRegisterModules()));
        String endpoint = "/api/auth/id-recovery/request";
        for (int i = 0; i < 10_000; i++) {
            assertTrue(filter.allow("198.51." + (i / 256) + "." + (i % 256),
                    endpoint, 1000), "fixture should fill exactly 10,000 windows");
        }
        // Documents the existing availability risk; this is not a security fix.
        assertFalse(filter.allow("203.0.113.5", endpoint, 1000),
                "previously unseen legitimate client is denied at capacity");
        assertTrue(filter.allow("198.51.0.0", endpoint, 1000),
                "existing clients continue within their quota");
        assertTrue(filter.allow("203.0.113.5", endpoint, 61_000),
                "expired windows eventually release capacity");
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
