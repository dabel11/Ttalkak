package com.ttalkak.subscription;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SubscriptionControllerTest {
    @Test
    void authenticatedMemberCanReadUsageAndCreateBillingDestinations() {
        AuthService authService = mock(AuthService.class);
        SubscriptionService subscriptionService = mock(SubscriptionService.class);
        when(authService.currentMemberIdOrNull("Bearer token")).thenReturn(7L);
        when(subscriptionService.current(7L)).thenReturn(Map.of("subscription", Map.of("plan", "FREE")));
        when(subscriptionService.checkout(7L, "PRO")).thenReturn(Map.of("checkoutUrl", "https://billing.example/checkout"));
        when(subscriptionService.portal(7L)).thenReturn(Map.of("portalUrl", "https://billing.example/portal"));
        SubscriptionController controller = new SubscriptionController(authService, subscriptionService);

        assertEquals("FREE", ((Map<?, ?>) controller.me("Bearer token").get("subscription")).get("plan"));
        controller.checkout("Bearer token", new SubscriptionController.CheckoutRequest("PRO"));
        controller.portal("Bearer token");
        verify(subscriptionService).checkout(7L, "PRO");
        verify(subscriptionService).portal(7L);
    }

    @Test
    void subscriptionEndpointsRequireLogin() {
        AuthService authService = mock(AuthService.class);
        when(authService.currentMemberIdOrNull(null)).thenReturn(null);
        SubscriptionController controller = new SubscriptionController(authService, mock(SubscriptionService.class));
        ApiException exception = assertThrows(ApiException.class, () -> controller.me(null));
        assertEquals("LOGIN_REQUIRED", exception.getCode());
    }
}
