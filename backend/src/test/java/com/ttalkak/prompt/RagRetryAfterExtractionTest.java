package com.ttalkak.prompt;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PromptController 가 rag-server 의 Retry-After 를 꺼내 쓰는 전제를 고정한다.
 *
 * <p>컨트롤러의 추출 로직은 {@code exception.getHeaders().getFirst(RETRY_AFTER)} 한 줄이라,
 * 정작 위험한 것은 "WebClientResponseException 이 상류 응답 헤더를 정말 들고 오는가"라는
 * <b>가정</b> 쪽이다. 그 가정이 틀리면 전달이 예외 없이 조용히 끊긴다.
 */
class RagRetryAfterExtractionTest {

    private WebClientResponseException upstream(
            HttpStatus status,
            String body,
            HttpHeaders headers
    ) {
        return WebClientResponseException.create(
                status.value(),
                status.getReasonPhrase(),
                headers,
                body.getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8
        );
    }

    @Test
    void webClientExceptionCarriesUpstreamRetryAfter() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, "30");

        WebClientResponseException exception = upstream(
                HttpStatus.SERVICE_UNAVAILABLE,
                "{\"detail\":\"생성 대기열이 가득 찼습니다\"}",
                headers
        );

        assertThat(
                exception.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)
        ).isEqualTo("30");
    }

    @Test
    void missingRetryAfterIsAbsentNotBlank() {
        WebClientResponseException exception = upstream(
                HttpStatus.SERVICE_UNAVAILABLE,
                "{\"detail\":\"AI 서비스 오류\"}",
                new HttpHeaders()
        );

        assertThat(
                exception.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)
        ).isNull();
    }

    @Test
    void extractedValueSurvivesIntoApiException() {
        // 게이트 거절 시나리오 전체 — 상류 헤더가 최종 응답 헤더까지 이어진다
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, "30");

        WebClientResponseException exception = upstream(
                HttpStatus.SERVICE_UNAVAILABLE,
                "{\"detail\":\"생성 대기열이 가득 찼습니다(동시 1건 · 대기 2건).\"}",
                headers
        );

        ApiException mapped = ApiException.retryable(
                HttpStatus.SERVICE_UNAVAILABLE,
                "AI_SERVICE_UNAVAILABLE",
                "AI 서비스를 일시적으로 사용할 수 없습니다.",
                exception.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)
        );

        assertThat(
                mapped.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)
        ).isEqualTo("30");
        assertThat(mapped.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(mapped.getCode()).isEqualTo("AI_SERVICE_UNAVAILABLE");
    }
}
