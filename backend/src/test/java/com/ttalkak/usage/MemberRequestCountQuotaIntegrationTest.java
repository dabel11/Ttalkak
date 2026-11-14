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
        "ttalkak.usage.pro-request-limit=3",
        "ttalkak.usage.exhibition-user-id=ttalkak_review",
        "ttalkak.usage.exhibition-request-limit=100"
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
    void exhibitionAccountKeepsUsageAndGetsHigherLimitWithoutAffectingOtherMembers() throws Exception {
        Member review = members.saveAndFlush(new Member(
                "ttalkak_review", "password", "exhibition_review", "Exhibition review", null, null, null));
        for (int i = 0; i < 11; i++) {
            usage.record(review.getId(), UUID.randomUUID().toString(),
                    new TokenCounts(80, 20, 100), Instant.now().minusSeconds(20 - i));
        }

        var permit = guard.acquire(review.getId());
        try {
            assertDoesNotThrow(() -> guard.checkQuota(permit));
        } finally {
            guard.release(permit);
        }
        mvc.perform(get("/api/me/usage")
                        .header("Authorization", "Bearer " + auth.issueAccessToken(review)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("FREE"))
                .andExpect(jsonPath("$.requests").value(11))
                .andExpect(jsonPath("$.requestLimit").value(100))
                .andExpect(jsonPath("$.requestRemaining").value(89))
                .andExpect(jsonPath("$.requestQuotaEnforced").value(true));

        Member ordinary = member();
        for (int i = 0; i < 2; i++) {
            usage.record(ordinary.getId(), UUID.randomUUID().toString(),
                    new TokenCounts(80, 20, 100), Instant.now().minusSeconds(5 - i));
        }
        var ordinaryPermit = guard.acquire(ordinary.getId());
        try {
            assertEquals("MEMBER_REQUEST_LIMIT_EXCEEDED",
                    assertThrows(ApiException.class, () -> guard.checkQuota(ordinaryPermit)).getCode());
        } finally {
            guard.release(ordinaryPermit);
        }
        mvc.perform(get("/api/me/usage")
                        .header("Authorization", "Bearer " + auth.issueAccessToken(ordinary)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestLimit").value(2))
                .andExpect(jsonPath("$.requestRemaining").value(0));
    }

    @Test
    void exhibitionAllowanceNeedsBothConfigurationValues() {
        assertThrows(IllegalArgumentException.class, () -> new MemberQuotaPolicy(
                false, 0, 0, true, 2, 30, 70, 150, "ttalkak_review", 0));
        assertThrows(IllegalArgumentException.class, () -> new MemberQuotaPolicy(
                false, 0, 0, true, 2, 30, 70, 150, "", 100));
        assertNull(new MemberQuotaPolicy(
                false, 0, 0, false, 2, 30, 70, 150, "ttalkak_review", 100)
                .effectiveRequestLimit("FREE", null, "ttalkak_review"));
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
