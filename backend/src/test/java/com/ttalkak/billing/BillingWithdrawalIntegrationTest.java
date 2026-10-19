package com.ttalkak.billing;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "BILLING_MODE=disabled"
})
@AutoConfigureMockMvc
@Transactional
class BillingWithdrawalIntegrationTest {

    @Autowired private MemberRepository members;
    @Autowired private BillingSubscriptionRepository subscriptions;
    @Autowired private AuthService auth;
    @Autowired private PasswordEncoder encoder;
    @Autowired private MockMvc mvc;

    @Test
    void closingAccountStopsRenewalButPreservesExistingBillingRecord() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 12);
        String password = "Fixture-Password-123!";
        Member member = members.saveAndFlush(new Member(
                "billwithdraw_" + suffix,
                encoder.encode(password),
                "bw_" + suffix,
                "Fixture Member", null, null, "billing-fixture@example.test"));
        BillingSubscription subscription = new BillingSubscription(member.getId());
        subscription.register("test_fixture_not_real_billing_key");
        subscriptions.saveAndFlush(subscription);

        assertTrue(subscriptions.findByMemberId(member.getId()).orElseThrow().isAutoRenew());
        String jwt = auth.issueAccessToken(member);
        mvc.perform(delete("/api/auth/withdraw")
                        .header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk());

        subscriptions.flush();
        BillingSubscription preserved = subscriptions.findByMemberId(member.getId()).orElseThrow();
        assertFalse(preserved.isAutoRenew(), "withdrawn account must not renew");
        assertEquals("test_fixture_not_real_billing_key", preserved.getBillingKey(),
                "existing billing/refund record is retained pending policy review");
        assertFalse(members.findById(member.getId()).orElseThrow().isActive());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isUnauthorized());
    }
}
