package com.ttalkak.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:merchant-review-test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "MERCHANT_REVIEW_ACCOUNT_ENABLED=true",
        "MERCHANT_REVIEW_ACCOUNT_PASSWORD=fixture-review-123!"
})
@AutoConfigureMockMvc
@DirtiesContext
class MerchantReviewAccountIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MemberRepository members;

    @Test void emailFreeReviewAccountCanLoginButCannotAccessAdminOrPurchaseWhenDisabled() throws Exception {
        var member = members.findByUserId("ttalkak_review").orElseThrow();
        assertThat(member.getEmail()).isNull();
        assertThat(member.getRole()).isEqualTo("USER");
        String response = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"ttalkak_review\",\"password\":\"fixture-review-123!\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("user"))
                .andReturn().getResponse().getContentAsString();
        String token = json.readTree(response).get("accessToken").asText();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/me/billing/setup").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"LIGHT\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("BILLING_NOT_CONFIGURED"));
    }
}
