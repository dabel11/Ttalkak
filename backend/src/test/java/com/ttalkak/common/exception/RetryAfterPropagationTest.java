package com.ttalkak.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * rag-server 의 동시 실행 게이트가 알려준 재시도 시점(Retry-After)이
 * 백엔드 응답까지 살아서 나가는지 검증한다.
 *
 * <p>이 경로가 끊기면 프론트는 "언제 다시 시도할지"를 알 수 없어, 사용자가
 * 직접 다시 누를 때까지 멈춰 있게 된다.
 */
class RetryAfterPropagationTest {

    private MockMvc mockMvc() {
        return MockMvcBuilders
                .standaloneSetup(new RetryableController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void retryAfterReachesTheResponse() throws Exception {
        mockMvc()
                .perform(get("/test/retryable"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "30"))
                .andExpect(jsonPath("$.code").value("AI_RATE_LIMIT_EXCEEDED"));
    }

    @Test
    void errorBodyStaysUnchangedWhenHeaderIsAdded() throws Exception {
        // 헤더를 붙이느라 기존 에러 계약(ADR-0008)이 깨지면 안 된다
        mockMvc()
                .perform(get("/test/retryable"))
                .andExpect(jsonPath("$.status").exists())
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.code").exists())
                .andExpect(jsonPath("$.message").exists())
                .andExpect(jsonPath("$.path").value("/test/retryable"));
    }

    @Test
    void plainApiExceptionSendsNoRetryAfter() throws Exception {
        // 재시도 시점을 모르는 오류에 헤더를 붙이면 거짓 정보를 주는 셈이다
        mockMvc()
                .perform(get("/test/plain"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void invalidUpstreamValuesAreDropped() {
        // 상류 값을 그대로 믿지 않는다 — 숫자가 아니면 헤더를 만들지 않는다
        assertThat(ApiException.retryAfterHeaders(null)).isEmpty();
        assertThat(ApiException.retryAfterHeaders("")).isEmpty();
        assertThat(ApiException.retryAfterHeaders("곧")).isEmpty();
        assertThat(ApiException.retryAfterHeaders("-5")).isEmpty();
        // HTTP 날짜 형식도 규격상 유효하지만 우리 상류는 초만 보낸다 → 받지 않는다
        assertThat(
                ApiException.retryAfterHeaders("Wed, 21 Oct 2026 07:28:00 GMT")
        ).isEmpty();
    }

    @Test
    void absurdUpstreamValueIsCapped() {
        // 상류가 하루를 기다리라고 해도 클라이언트를 그만큼 묶어 두지 않는다
        HttpHeaders headers = ApiException.retryAfterHeaders("999999");

        assertThat(headers.getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("3600");
    }

    @Test
    void validValueIsForwardedAsIs() {
        assertThat(
                ApiException.retryAfterHeaders(" 45 ").getFirst(HttpHeaders.RETRY_AFTER)
        ).isEqualTo("45");
        // 0 은 '즉시 재시도 가능'이라는 유효한 값이다
        assertThat(
                ApiException.retryAfterHeaders("0").getFirst(HttpHeaders.RETRY_AFTER)
        ).isEqualTo("0");
    }

    @RestController
    private static class RetryableController {

        @GetMapping("/test/retryable")
        public void retryable() {
            throw ApiException.retryable(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_RATE_LIMIT_EXCEEDED",
                    "AI 서비스 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
                    "30"
            );
        }

        @GetMapping("/test/plain")
        public void plain() {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_SERVICE_UNAVAILABLE",
                    "AI 서비스를 일시적으로 사용할 수 없습니다."
            );
        }
    }
}
