package com.ttalkak.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.Rollback;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "RAG_RESPONSE_TIMEOUT=2s"
})
@AutoConfigureMockMvc
@Transactional
@Rollback
class WithdrawnUserIdIntegrationTest {

    private static final String USER_ID =
            "withdrawn-integration-user";

    private static final String PASSWORD =
            "IntegrationPassword123!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MemberRepository memberRepository;

    @Test
    void rejectsSignupWithSameUserIdAfterWithdrawal()
            throws Exception {

        String signupResponse = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "nickname": "withdrawal-test-user",
                                  "name": "Withdrawal Test User",
                                  "birth": null,
                                  "phone": null,
                                  "email": "withdrawal-test@example.com",
                                  "userId": "%s",
                                  "password": "%s",
                                  "passwordConfirm": "%s",
                                  "agreeTerms": true,
                                  "agreePrivacy": true
                                }
                                """.formatted(
                                        USER_ID,
                                        PASSWORD,
                                        PASSWORD
                                )))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode signupBody =
                objectMapper.readTree(signupResponse);

        String accessToken =
                signupBody.get("accessToken").asText();

        mockMvc.perform(delete("/api/auth/withdraw")
                        .header(
                                "Authorization",
                                "Bearer " + accessToken
                        )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "%s",
                                  "credential": null
                                }
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        Member withdrawnMember = memberRepository
                .findByUserId(USER_ID)
                .orElseThrow();

        assertFalse(withdrawnMember.isActive());
        assertTrue(memberRepository.existsByUserId(USER_ID));

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "nickname": "new-test-user",
                                  "name": "New Test User",
                                  "birth": null,
                                  "phone": null,
                                  "email": "new-test@example.com",
                                  "userId": "%s",
                                  "password": "%s",
                                  "passwordConfirm": "%s",
                                  "agreeTerms": true,
                                  "agreePrivacy": true
                                }
                                """.formatted(
                                        USER_ID,
                                        PASSWORD,
                                        PASSWORD
                                )))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("이미 사용 중인 아이디입니다."));
    }
}