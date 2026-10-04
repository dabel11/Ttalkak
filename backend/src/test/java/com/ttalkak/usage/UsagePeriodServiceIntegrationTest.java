package com.ttalkak.usage;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
})
class UsagePeriodServiceIntegrationTest {
    @Autowired
    private UsagePeriodService periods;

    @Autowired
    private PaidUsagePeriodRepository paidPeriods;

    @Autowired
    private MemberTokenUsageService usage;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private MemberRepository members;

    @Autowired
    private AuthService auth;

    private long memberId() {
        return Math.abs(UUID.randomUUID().getMostSignificantBits() % 1_000_000) + 1;
    }

    @Test
    void freePeriodResetsAtSeoulMidnight() {
        long memberId = memberId();
        usage.record(memberId, UUID.randomUUID().toString(), new TokenCounts(10, 2, 12),
                Instant.parse("2026-09-30T14:59:59Z"));
        usage.record(memberId, UUID.randomUUID().toString(), new TokenCounts(20, 5, 25),
                Instant.parse("2026-09-30T15:00:01Z"));

        var snapshot = periods.at(memberId, Instant.parse("2026-09-30T15:00:02Z"));
        assertEquals("FREE", snapshot.plan());
        assertEquals(Instant.parse("2026-09-30T15:00:00Z"), snapshot.periodStart());
        assertEquals(Instant.parse("2026-10-31T15:00:00Z"), snapshot.periodEnd());
        assertEquals(25, snapshot.totalTokens());
        assertEquals(1, snapshot.requests());
    }

    @Test
    void proUsesPaidPeriodThenFreeStartsAtItsEnd() {
        long memberId = memberId();
        Instant paidStart = Instant.parse("2026-10-09T15:00:00Z");
        Instant paidEnd = Instant.parse("2026-10-19T15:00:00Z");
        paidPeriods.saveAndFlush(new PaidUsagePeriod(memberId, UUID.randomUUID().toString(),
                paidStart, paidEnd));
        usage.record(memberId, UUID.randomUUID().toString(), new TokenCounts(40, 10, 50),
                Instant.parse("2026-10-10T00:00:00Z"));
        usage.record(memberId, UUID.randomUUID().toString(), new TokenCounts(20, 5, 25),
                Instant.parse("2026-10-19T15:00:01Z"));

        var pro = periods.at(memberId, Instant.parse("2026-10-15T00:00:00Z"));
        assertEquals("PRO", pro.plan());
        assertEquals(paidStart, pro.periodStart());
        assertEquals(paidEnd, pro.periodEnd());
        assertEquals(50, pro.totalTokens());

        var free = periods.at(memberId, Instant.parse("2026-10-19T15:00:02Z"));
        assertEquals("FREE", free.plan());
        assertEquals(paidEnd, free.periodStart());
        assertEquals(Instant.parse("2026-10-31T15:00:00Z"), free.periodEnd());
        assertEquals(25, free.totalTokens());
    }

    @Test
    void confirmedFuturePeriodEndsFreeWindowAtPaidStart() {
        long memberId = memberId();
        Instant paidStart = Instant.parse("2026-10-10T00:00:00Z");
        paidPeriods.saveAndFlush(new PaidUsagePeriod(memberId, UUID.randomUUID().toString(),
                paidStart, Instant.parse("2026-11-10T00:00:00Z")));
        var free = periods.at(memberId, Instant.parse("2026-10-05T00:00:00Z"));
        assertEquals("FREE", free.plan());
        assertEquals(paidStart, free.periodEnd());
        assertEquals(0, free.totalTokens());
    }

    @Test
    void usageEndpointRequiresAuthenticationAndUsesSignedInMember() throws Exception {
        mvc.perform(get("/api/me/usage")).andExpect(status().isUnauthorized());

        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Member member = members.save(new Member("usage_" + suffix, "password", "usage_" + suffix,
                "사용량 테스트", null, null, null));
        String token = auth.issueAccessToken(member);
        mvc.perform(get("/api/me/usage").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("FREE"))
                .andExpect(jsonPath("$.totalTokens").value(0));
    }
}
