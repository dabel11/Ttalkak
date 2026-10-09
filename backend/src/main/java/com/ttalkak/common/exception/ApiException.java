package com.ttalkak.common.exception;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

public class ApiException extends ResponseStatusException {

    /**
     * Retry-After 로 내보낼 수 있는 최대 초. 상류(rag-server)가 비정상적으로 큰 값을
     * 주더라도 클라이언트를 한 시간 넘게 묶어 두지 않는다.
     */
    private static final long MAX_RETRY_AFTER_SECONDS = 3600L;

    private final String code;
    private final HttpHeaders headers;

    public ApiException(
            HttpStatusCode status,
            String code,
            String message
    ) {
        this(status, code, message, HttpHeaders.EMPTY);
    }

    public ApiException(
            HttpStatusCode status,
            String code,
            String message,
            HttpHeaders headers
    ) {
        super(status, message);
        this.code = code;
        this.headers = headers == null ? HttpHeaders.EMPTY : headers;
    }

    /**
     * 재시도 시점을 알려주는 예외를 만든다.
     *
     * <p>rag-server 는 동시 실행 게이트에 걸린 요청을 {@code 503 + Retry-After} 로
     * 돌려준다. 그 값을 여기까지 전달하지 않으면 프론트는 "언제 다시 시도할지"를
     * 알 수 없어 사용자가 직접 다시 누를 때까지 멈춰 있게 된다.
     *
     * @param retryAfterSeconds 초 단위 문자열. null·비숫자·음수면 헤더를 붙이지 않는다.
     */
    public static ApiException retryable(
            HttpStatusCode status,
            String code,
            String message,
            String retryAfterSeconds
    ) {
        return new ApiException(
                status,
                code,
                message,
                retryAfterHeaders(retryAfterSeconds)
        );
    }

    /**
     * 초 문자열을 Retry-After 헤더로 변환. 값이 유효하지 않으면 빈 헤더.
     *
     * <p>상류가 준 값을 그대로 믿지 않는다 — 숫자만 허용하고 상한을 씌운다.
     * (HTTP 날짜 형식도 규격상 유효하지만, 우리 상류는 초만 보내므로 받지 않는다.)
     */
    public static HttpHeaders retryAfterHeaders(String retryAfterSeconds) {
        if (retryAfterSeconds == null || retryAfterSeconds.isBlank()) {
            return HttpHeaders.EMPTY;
        }

        long seconds;
        try {
            seconds = Long.parseLong(retryAfterSeconds.trim());
        } catch (NumberFormatException e) {
            return HttpHeaders.EMPTY;
        }

        if (seconds < 0) {
            return HttpHeaders.EMPTY;
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set(
                HttpHeaders.RETRY_AFTER,
                String.valueOf(Math.min(seconds, MAX_RETRY_AFTER_SECONDS))
        );
        return headers;
    }

    public String getCode() {
        return code;
    }

    /**
     * 응답에 함께 내보낼 헤더. {@link GlobalExceptionHandler} 가 읽는다.
     */
    @Override
    public HttpHeaders getHeaders() {
        return headers;
    }
}
