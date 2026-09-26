package com.ttalkak.subscription;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SubscriptionServiceTest {
    @Test
    void checkoutRequiresAConfiguredBillingProvider() {
        UsageService usageService = mock(UsageService.class);
        BillingGateway gateway = mock(BillingGateway.class);
        when(gateway.createCheckout(1L, "PRO")).thenReturn(Optional.empty());
        SubscriptionService service = new SubscriptionService(usageService, gateway);

        ApiException exception = assertThrows(ApiException.class, () -> service.checkout(1L, "PRO"));
        assertEquals("BILLING_PROVIDER_NOT_CONFIGURED", exception.getCode());
    }

    @Test
    void checkoutAndPortalReturnOnlyHttpsDestinations() {
        UsageService usageService = mock(UsageService.class);
        BillingGateway gateway = mock(BillingGateway.class);
        when(gateway.createCheckout(1L, "PRO")).thenReturn(Optional.of(URI.create("https://billing.example/checkout")));
        when(gateway.createPortal(1L)).thenReturn(Optional.of(URI.create("https://billing.example/portal")));
        SubscriptionService service = new SubscriptionService(usageService, gateway);

        assertEquals(Map.of("checkoutUrl", "https://billing.example/checkout"), service.checkout(1L, "PRO"));
        assertEquals(Map.of("portalUrl", "https://billing.example/portal"), service.portal(1L));
    }
}
