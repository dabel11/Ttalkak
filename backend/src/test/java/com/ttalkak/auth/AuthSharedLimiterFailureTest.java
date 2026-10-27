package com.ttalkak.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.common.exception.ApiErrorWriter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class AuthSharedLimiterFailureTest {
    @Test void storeFailureNeverFallsBackToAnEmptyLocalQuotaOrDispatchesAuth() throws Exception {
        var properties = new ServerProperties();
        properties.setForwardHeadersStrategy(ServerProperties.ForwardHeadersStrategy.NONE);
        var filter = new AuthRateLimitFilter(new ApiErrorWriter(new ObjectMapper()), "", false, properties,
                (address, path) -> { throw new org.springframework.dao.DataAccessResourceFailureException("fixture unavailable"); });
        for (int i = 0; i < 2; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/find-id");
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, resp) -> fail("unverified authentication request dispatched"));
            assertEquals(503, response.getStatus());
            assertEquals("5", response.getHeader("Retry-After"));
            assertTrue(response.getContentAsString().contains("AUTH_RATE_LIMIT_UNAVAILABLE"));
        }
    }
}
