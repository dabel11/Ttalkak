package com.ttalkak.usage;

import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
class AdminUsageRecoveryIntegrationTest {
    @Autowired MemberRepository members;
    @Autowired MemberRequestGuard guard;
    @Autowired MemberTokenUsageService usage;
    @Autowired AdminAuditLogRepository audits;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;

    Member member(boolean admin) {
        String key = UUID.randomUUID().toString();
        return members.saveAndFlush(admin ? Member.createAdmin(key, "password", key, "Admin")
                : new Member(key, "password", key, "Test", null, null, null));
    }
    String body(long revision, long tokens, boolean reviewed, String reason) {
        return "{\"expectedRevision\":" + revision + ",\"expectedTotalTokens\":" + tokens
                + ",\"recordsReviewed\":" + reviewed + ",\"reason\":\"" + reason + "\"}";
    }
    String bearer(Member member) { return "Bearer " + auth.issueAccessToken(member); }
    String path(Member member) { return "/api/admin/users/" + member.getId() + "/usage"; }

    @Test void ordinaryMembersCannotInspectOrRecoverUsage() throws Exception {
        Member member = member(false);
        mvc.perform(get(path(member)).header("Authorization", bearer(member))).andExpect(status().isForbidden());
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(member))
                .contentType(MediaType.APPLICATION_JSON).content(body(0, 0, true, "reviewed")))
                .andExpect(status().isForbidden());
    }
    @Test void recoveryPreservesTokensAuditsReasonAndLateMissingUsageFlagsAgain() throws Exception {
        Member admin = member(true), member = member(false);
        usage.record(member.getId(), "confirmed", new TokenCounts(10, 5, 15), Instant.now());
        var permit = guard.acquire(member.getId());
        guard.usageMissing(permit); guard.release(permit);
        mvc.perform(get(path(member)).header("Authorization", bearer(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.uncertaintyRevision").value(1));
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(1, 15, true, "provider records reviewed")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.usageUncertain").value(false))
                .andExpect(jsonPath("$.totalTokens").value(15));
        assertTrue(audits.findAll().stream().anyMatch(a -> a.getTargetId().equals(member.getId())
                && a.getAction().equals("USAGE_RECONCILE") && a.getDetail().contains("provider records reviewed")));
        guard.usageMissing(permit);
        assertTrue(guard.usageUncertain(member.getId()));
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(1, 15, true, "stale review")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("USAGE_REVIEW_STALE"));
    }
    @Test void activeRequestsStaleTotalsAndUnreviewedGapsCannotBeCleared() throws Exception {
        Member admin = member(true), member = member(false);
        var permit = guard.acquire(member.getId()); guard.usageMissing(permit);
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(1, 0, true, "reviewed")))
                .andExpect(status().isConflict());
        guard.release(permit);
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(1, 0, false, "reviewed")))
                .andExpect(status().isBadRequest());
        usage.record(member.getId(), "new", new TokenCounts(1, 1, 2), Instant.now());
        mvc.perform(post(path(member) + "/reconcile").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(1, 0, true, "reviewed")))
                .andExpect(status().isConflict());
        assertTrue(guard.usageUncertain(member.getId()));
    }
}
