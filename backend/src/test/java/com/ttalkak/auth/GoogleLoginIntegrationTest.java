package com.ttalkak.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.member.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "GOOGLE_CLIENT_ID=fixture.apps.googleusercontent.com"
})
@AutoConfigureMockMvc
@Transactional
class GoogleLoginIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MemberRepository members;
    @MockitoBean GoogleIdTokenVerifier verifier;

    @Test void signupThenLoginIssuesUsableTokensForTheSameOrdinaryMember() throws Exception {
        var identity = new GoogleIdTokenVerifier.GoogleIdentity("integration-google-subject",
                "fixture-google@example.com", "Fixture Google", "");
        when(verifier.verify("first-token")).thenReturn(identity);
        when(verifier.verify("fresh-token")).thenReturn(identity);
        long before = members.count();
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\"first-token\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AUTH_TERMS_REQUIRED"));
        assertThat(members.count()).isEqualTo(before);
        String created = mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\"first-token\",\"agreeTerms\":true,\"agreePrivacy\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.newMember").value(true))
                .andExpect(jsonPath("$.user.provider").value("google"))
                .andExpect(jsonPath("$.user.role").value("user"))
                .andReturn().getResponse().getContentAsString();
        String loggedIn = mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\"fresh-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.newMember").value(false))
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(loggedIn).path("user").path("id").asLong())
                .isEqualTo(json.readTree(created).path("user").path("id").asLong());
        assertThat(members.count()).isEqualTo(before + 1);
        for (String response : new String[]{created, loggedIn}) {
            String token = json.readTree(response).path("accessToken").asText();
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.user.provider").value("google"));
            mvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + token))
                    .andExpect(status().isForbidden());
        }
    }

    @Test void browserConfigurationPublishesOnlyThePublicClientId() throws Exception {
        mvc.perform(get("/api/auth/google/config"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.clientId").value("fixture.apps.googleusercontent.com"));
    }
}
