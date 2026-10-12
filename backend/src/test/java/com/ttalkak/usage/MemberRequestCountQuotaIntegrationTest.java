package com.ttalkak.usage;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "ttalkak.usage.quota-enabled=false",
        "ttalkak.usage.request-quota-enabled=true",
        "ttalkak.usage.free-request-limit=2",
        "ttalkak.usage.pro-request-limit=3"
})
class MemberRequestCountQuotaIntegrationTest {
    @Autowired MemberRequestGuard guard;
    @Autowired MemberTokenUsageService usage;
    @Autowired MemberRepository members;
    @Autowired PaidUsagePeriodRepository paid;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;

    private Member member() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        return members.saveAndFlush(new Member("calls_" + suffix, "password", "calls_" + suffix,
                "Calls test", null, null, null));
    }

    @Test
    void meteredFreeCallsAreCappedWhileAProPeriodGetsItsOwnAllowance() throws Exception {
        Member member = member();
        Long memberId = member.getId();
        for (int i = 0; i < 2; i++) {
            usage.record(memberId, UUID.randomUUID().toString(),
                    new TokenCounts(80, 20, 100), Instant.now().minusSeconds(3 - i));
        }
        var permit = guard.acquire(memberId);
        try {
            assertEquals("MEMBER_REQUEST_LIMIT_EXCEEDED",
                    assertThrows(ApiException.class, () -> guard.checkQuota(permit)).getCode());
        } finally {
            guard.release(permit);
        }

        String token = auth.issueAccessToken(member);
        mvc.perform(get("/api/me/usage").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("FREE"))
                .andExpect(jsonPath("$.requests").value(2))
                .andExpect(jsonPath("$.requestLimit").value(2))
                .andExpect(jsonPath("$.requestRemaining").value(0))
                .andExpect(jsonPath("$.requestLimitReached").value(true))
                .andExpect(jsonPath("$.requestQuotaEnforced").value(true))
                .andExpect(jsonPath("$.quotaEnforced").value(true));

        paid.saveAndFlush(new PaidUsagePeriod(memberId, UUID.randomUUID().toString(),
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(600)));
        var paidPermit = guard.acquire(memberId);
        try {
            assertDoesNotThrow(() -> guard.checkQuota(paidPermit));
        } finally {
            guard.release(paidPermit);
        }
        mvc.perform(get("/api/me/usage").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("PRO"))
                .andExpect(jsonPath("$.requests").value(0))
                .andExpect(jsonPath("$.requestLimit").value(3))
                .andExpect(jsonPath("$.requestRemaining").value(3));
    }

    @Test
    void requestLimitsMustBeExplicitlyPositiveBeforeTheyCanBeEnabled() {
        assertThrows(IllegalArgumentException.class,
                () -> new MemberQuotaPolicy(false, 0, 0, true, 0, 150));
        assertThrows(IllegalArgumentException.class,
                () -> new MemberQuotaPolicy(false, 0, 0, true, 10, -1));
        assertNull(new MemberQuotaPolicy(false, 0, 0, false, 10, 150).requestLimit("FREE"));
        assertEquals(150L, new MemberQuotaPolicy(false, 0, 0, true, 10, 150).requestLimit("PRO"));
    }
}
