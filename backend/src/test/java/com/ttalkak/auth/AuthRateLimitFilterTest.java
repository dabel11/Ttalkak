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
