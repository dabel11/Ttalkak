package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BillingContextTest {
    @Test void caseAliasesAreRejectedInsteadOfSharingDatabaseNamespaces() {
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("test", "test:Legacy"));
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("test", "test:SHOP"));
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("live", "live:Shop"));
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("disabled", "test:Legacy"));
        assertEquals("test:shop_1-2", new BillingContext("test", "test:shop_1-2").scope());
        assertFalse(new BillingContext("test", "test:shop_1-2").matches(null));
    }
    @Test void legacyNullRowsOnlyBelongToOriginalTestStore() {
        assertTrue(new BillingContext("test", "test:legacy").matches(null));
        assertFalse(new BillingContext("test", "test:another").matches(null));
        assertFalse(new BillingContext("live", "live:shop").matches(null));
    }
    @Test void liveAndDisabledNeverEnableProviderCalls() {
        assertThrows(ApiException.class, () -> new BillingContext("live", "live:shop").requireTest());
        assertThrows(ApiException.class, () -> new BillingContext("disabled", "test:legacy").requireTest());
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("live", "test:legacy"));
        assertThrows(IllegalArgumentException.class, () -> new BillingContext("typo", "test:legacy"));
    }
}
