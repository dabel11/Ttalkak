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
}
