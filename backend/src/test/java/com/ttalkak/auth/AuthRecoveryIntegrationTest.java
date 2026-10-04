package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
@AutoConfigureMockMvc
@Transactional
class AuthRecoveryIntegrationTest {
    @Autowired MemberRepository members;
    @Autowired PasswordResetTokenRepository tokens;
    @Autowired PasswordResetService recovery;
    @Autowired PasswordEncoder encoder;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;
    @MockitoBean PasswordResetMailer mailer;
    private Member member;
    @BeforeEach void setup() {
        member = members.saveAndFlush(new Member("recovery_" + UUID.randomUUID().toString().substring(0, 8),
                encoder.encode("old-password"), "recovery-" + UUID.randomUUID(), "Name", null, null, "user@example.com"));
    }
    private String issueCode() {
        recovery.request(member.getUserId(), member.getEmail());
        var capture = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq(member.getEmail()), capture.capture());
        return capture.getValue();
    }
    @Test void resetCodeIsHashedOneUseAndRevokesPreviousSessions() {
        String oldJwt = auth.issueAccessToken(member);
        String code = issueCode();
        assertEquals(43, code.length());
        assertEquals(1, tokens.count());
        assertTrue(tokens.findByTokenHash(PasswordResetService.hash(code)).isPresent());
        assertTrue(auth.getMemberFromAuthorization("Bearer " + oldJwt).isPresent());
        recovery.complete(code, "new-password", "new-password");
        assertTrue(encoder.matches("new-password", member.getPassword()));
        assertFalse(encoder.matches("old-password", member.getPassword()));
        assertEquals(0, tokens.count());
        assertTrue(auth.getMemberFromAuthorization("Bearer " + oldJwt).isEmpty());
        assertTrue(auth.getMemberFromAuthorization("Bearer " + auth.issueAccessToken(member)).isPresent());
        assertThrows(ApiException.class, () -> recovery.complete(code, "another-password", "another-password"));
    }
    @Test void expiredAndInvalidCodesDoNotChangePassword() {
        String code = "a".repeat(43);
        tokens.saveAndFlush(new PasswordResetToken(member.getId(), PasswordResetService.hash(code), Instant.now().minusSeconds(1000)));
        var error = assertThrows(ApiException.class, () -> recovery.complete(code, "new-password", "new-password"));
        assertEquals("PASSWORD_RESET_TOKEN_INVALID", error.getCode());
        assertThrows(ApiException.class, () -> recovery.complete("b".repeat(43), "new-password", "new-password"));
        assertTrue(encoder.matches("old-password", member.getPassword()));
    }
    @Test void resendCooldownDoesNotInvalidateFirstCode() {
        String code = issueCode();
        recovery.request(member.getUserId(), member.getEmail());
        verify(mailer, times(1)).send(anyString(), anyString());
        recovery.complete(code, "new-password", "new-password");
    }
    @Test void wrongEmailAndGoogleAccountsDoNotReceiveLocalResetCodes() {
        recovery.request(member.getUserId(), "other@example.com");
        recovery.request("missing_user", "user@example.com");
        Member google = members.saveAndFlush(Member.createGoogle("google_recovery", encoder.encode("random-password"),
                "google-recovery", "Name", "user@example.com", "recovery-google-subject"));
        recovery.request(google.getUserId(), google.getEmail());
        verify(mailer, never()).send(anyString(), anyString());
    }
    @Test void invalidPasswordDoesNotConsumeCode() {
        String code = issueCode();
        assertThrows(ApiException.class, () -> recovery.complete(code, "short", "short"));
        assertThrows(ApiException.class, () -> recovery.complete(code, "new-password", "different"));
        recovery.complete(code, "new-password", "new-password");
    }
    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void mailFailureRollsBackNewCode() {
        doThrow(new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "PASSWORD_RESET_DELIVERY_FAILED", "failed")).when(mailer).send(anyString(), anyString());
        try {
            assertThrows(ApiException.class, () -> recovery.request(member.getUserId(), member.getEmail()));
            assertTrue(tokens.findById(member.getId()).isEmpty());
        } finally { members.deleteById(member.getId()); }
    }
    @Test void sessionEndpointRejectsAnonymousAndLogoutInvalidatesJwt() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        String jwt = auth.issueAccessToken(member);
        String otherJwt = auth.issueAccessToken(member);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.provider").value("local"));
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk()).andExpect(jsonPath("$.scope").value("current_session"));
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + otherJwt))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout-all").header("Authorization", "Bearer " + otherJwt))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + otherJwt))
                .andExpect(status().isUnauthorized());
    }
    @Test void passwordChangeRequiresCurrentPasswordAndRevokesAllSessions() throws Exception {
        String jwt = auth.issueAccessToken(member);
        mvc.perform(post("/api/auth/password/change").header("Authorization", "Bearer " + jwt)
                .contentType("application/json")
                .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"new-password\",\"passwordConfirm\":\"new-password\"}"))
                .andExpect(status().isForbidden());
        assertTrue(auth.getMemberFromAuthorization("Bearer " + jwt).isPresent());
        mvc.perform(post("/api/auth/password/change").header("Authorization", "Bearer " + jwt)
                .contentType("application/json")
                .content("{\"currentPassword\":\"old-password\",\"newPassword\":\"new-password\",\"passwordConfirm\":\"new-password\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.loginRequired").value(true));
        assertTrue(auth.getMemberFromAuthorization("Bearer " + jwt).isEmpty());
        assertTrue(encoder.matches("new-password", member.getPassword()));
    }
    @Test void expiredAndMalformedJwtCannotRestoreSession() {
        var key = io.jsonwebtoken.security.Keys.hmacShaKeyFor(io.jsonwebtoken.io.Decoders.BASE64
                .decode("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="));
        String expired = io.jsonwebtoken.Jwts.builder().issuer("ttalkak").subject(member.getId().toString())
                .expiration(java.util.Date.from(Instant.now().minusSeconds(10))).signWith(key).compact();
        assertTrue(auth.getMemberFromAuthorization("Bearer " + expired).isEmpty());
        assertTrue(auth.getMemberFromAuthorization("Bearer invalid-jwt").isEmpty());
    }
    @Test void unconfiguredRecoveryDoesNotClaimDelivery() throws Exception {
        doThrow(new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "PASSWORD_RESET_UNAVAILABLE", "not configured")).when(mailer).requireEnabled();
        mvc.perform(post("/api/auth/password-reset/request").contentType("application/json")
                        .content("{\"userId\":\"user\",\"email\":\"user@example.com\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_UNAVAILABLE"));
    }
    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentResetCompletionsConsumeCodeOnlyOnce() throws Exception {
        String code = issueCode();
        var workers = java.util.concurrent.Executors.newFixedThreadPool(2);
        var start = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Boolean> complete = () -> {
            start.await();
            try { recovery.complete(code, "new-password", "new-password"); return true; }
            catch (ApiException exception) { return false; }
        };
        try {
            var first = workers.submit(complete);
            var second = workers.submit(complete);
            start.countDown();
            int successes = (first.get(10, java.util.concurrent.TimeUnit.SECONDS) ? 1 : 0)
                    + (second.get(10, java.util.concurrent.TimeUnit.SECONDS) ? 1 : 0);
            assertEquals(1, successes);
            assertTrue(tokens.findById(member.getId()).isEmpty());
            assertEquals(1, members.findById(member.getId()).orElseThrow().getAuthVersion());
        } finally {
            workers.shutdownNow();
            tokens.deleteById(member.getId());
            members.deleteById(member.getId());
        }
    }
    @Test void idRecoverySendsOnlyToTheRegisteredLocalEmail() {
        recovery.recoverUserId("Name", "other@example.com");
        verify(mailer, never()).sendUserId(anyString(), anyString());
        recovery.recoverUserId("Name", member.getEmail());
        verify(mailer).sendUserId(member.getEmail(), member.getUserId());
    }
}
