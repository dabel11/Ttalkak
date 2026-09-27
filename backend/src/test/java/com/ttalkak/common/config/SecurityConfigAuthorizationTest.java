package com.ttalkak.common.config;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.stream.Stream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "ttalkak.jwt.secret-base64="
                + "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        "ttalkak.jwt.expiration-minutes=120",
        "ttalkak.jwt.issuer=ttalkak",
        "ttalkak.admin.seed-enabled=false"
})
@AutoConfigureMockMvc
class SecurityConfigAuthorizationTest {

    @Autowired
    private MockMvc mockMvc;

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("generalUserWriteEndpoints")
    @WithMockUser(username = "admin", roles = "ADMIN")
    void adminCannotCallGeneralUserWriteApi(
            HttpMethod method,
            String path
    ) throws Exception {
        mockMvc.perform(
                        request(method, path)
                                .contentType("application/json")
                                .content("{}")
                )
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    private static Stream<Arguments> generalUserWriteEndpoints() {
        return Stream.of(
                Arguments.of(
                        HttpMethod.POST,
                        "/api/prompts/999999999/save"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/prompts/999999999/like"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/prompts/999999999/comments"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/prompts/999999999/revision-requests"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/comments/999999999/replies"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/reports/prompts/999999999"
                ),
                Arguments.of(
                        HttpMethod.POST,
                        "/api/make/threads"
                ),
                Arguments.of(
                        HttpMethod.PATCH,
                        "/api/me/author-revision-requests/999999999/status"
                ),
                Arguments.of(
                        HttpMethod.PATCH,
                        "/api/make/threads/999999999/folder"
                ),
                Arguments.of(
                        HttpMethod.DELETE,
                        "/api/make/folders/999999999"
                )
        );
    }
}