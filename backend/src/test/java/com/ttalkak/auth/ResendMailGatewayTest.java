package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ResendMailGatewayTest {
    @Test void sendsRecoveryAsAuthenticatedJsonWithoutSmtp() {
        var client = new RestTemplate();
        var server = MockRestServiceServer.bindTo(client).build();
        var gateway = new ResendMailGateway("fixture-api-key", client);
        server.expect(requestTo(ResendMailGateway.ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer fixture-api-key"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.from").value("onboarding@resend.dev"))
                .andExpect(jsonPath("$.to[0]").value("owner@example.com"))
                .andExpect(jsonPath("$.subject").value("복구"))
                .andExpect(jsonPath("$.text").value("code-fixture"))
                .andRespond(withSuccess("{\"id\":\"email-fixture\"}", MediaType.APPLICATION_JSON));
        gateway.send("onboarding@resend.dev", "owner@example.com", "복구", "code-fixture");
        server.verify();
    }

    @Test void rejectsMissingCredentialsAndSanitizesProviderFailures() {
        assertFalse(new ResendMailGateway("", new RestTemplate()).isConfigured());
        for (var status : new HttpStatus[]{HttpStatus.FORBIDDEN, HttpStatus.TOO_MANY_REQUESTS,
                HttpStatus.INTERNAL_SERVER_ERROR}) {
            var client = new RestTemplate();
            var server = MockRestServiceServer.bindTo(client).build();
            server.expect(requestTo(ResendMailGateway.ENDPOINT)).andRespond(withStatus(status)
                    .contentType(MediaType.APPLICATION_JSON).body("{\"message\":\"private-code\"}"));
            var error = assertThrows(ApiException.class, () -> new ResendMailGateway("fixture", client)
                    .send("from@example.com", "to@example.com", "subject", "private-code"));
            assertEquals("PASSWORD_RESET_DELIVERY_FAILED", error.getCode());
            assertFalse(error.getReason().contains("private-code"));
            assertNull(error.getCause());
            server.verify();
        }
    }

    @Test void successWithoutDeliveryIdIsNotAccepted() {
        var client = new RestTemplate();
        var server = MockRestServiceServer.bindTo(client).build();
        server.expect(requestTo(ResendMailGateway.ENDPOINT))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThrows(ApiException.class, () -> new ResendMailGateway("fixture", client)
                .send("from@example.com", "to@example.com", "subject", "text"));
        server.verify();
    }

    @Test void networkFailureHasNoSensitiveCause() {
        var client = mock(RestTemplate.class);
        when(client.postForEntity(eq(ResendMailGateway.ENDPOINT), any(), eq(ResendMailGateway.Delivery.class)))
                .thenThrow(new ResourceAccessException("private transport details"));
        var error = assertThrows(ApiException.class, () -> new ResendMailGateway("fixture", client)
                .send("from@example.com", "to@example.com", "subject", "text"));
        assertEquals("PASSWORD_RESET_DELIVERY_FAILED", error.getCode());
        assertNull(error.getCause());
    }
}
