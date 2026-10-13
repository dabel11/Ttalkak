package com.ttalkak.billing;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.usage.PaidUsagePeriodRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
    "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    "spring.datasource.url=jdbc:h2:mem:ttalkak-disabled-test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "TOSS_TEST_CLIENT_KEY=test_ck_example", "TOSS_TEST_SECRET_KEY=test_sk_example", "BILLING_POLL_MS=3600000"
})
class BillingDisabledIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AuthService auth;
    @Autowired MemberRepository members;
    @Autowired BillingSubscriptionRepository subscriptions;
    @Autowired BillingChargeRepository charges;
    @Autowired PaidUsagePeriodRepository paid;
    @Autowired BillingService billing;
    @Autowired BillingContext context;
    @MockitoBean BillingGateway gateway;

    @Test void missingModeDisablesDirectPurchasesEvenWithTestKeysAndCreatesNoBillingRows() throws Exception {
        doCallRealMethod().when(gateway).withinRequestBudget(any());
        String key = UUID.randomUUID().toString();
        Member owner = members.saveAndFlush(new Member(key, "password", key, "Member", null, null, null));
        String token = "Bearer " + auth.issueAccessToken(owner);
        assertFalse(context.testEnabled());
        long subscriptionCount = subscriptions.count(), chargeCount = charges.count(), periodCount = paid.count();
        String[][] calls = {
            {"setup", "{\"plan\":\"LIGHT\"}"},
            {"complete", "{\"customerKey\":\"customer\",\"authKey\":\"auth\"}"},
            {"retry", "{}"},
            {"upgrade", "{\"plan\":\"PRO\",\"expectedAmount\":9900}"}
        };
        for (String[] call : calls) {
            mvc.perform(post("/api/me/billing/" + call[0]).header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(call[1]))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("BILLING_NOT_CONFIGURED"));
        }
        billing.chargeDue();
        assertEquals(subscriptionCount, subscriptions.count());
        assertEquals(chargeCount, charges.count());
        assertEquals(periodCount, paid.count());
        verify(gateway, never()).issueBillingKey(anyString(), anyString());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
        verify(gateway, never()).cancel(anyString(), anyString(), anyInt());
    }
}
