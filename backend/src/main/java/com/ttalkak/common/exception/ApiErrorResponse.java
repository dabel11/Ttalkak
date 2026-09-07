package com.ttalkak.common.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import java.time.OffsetDateTime;

public record ApiErrorResponse(
        OffsetDateTime timestamp,
        int status,
        String error,
        String code,
        String message,
        String path
) {

    public static ApiErrorResponse of(
            HttpStatusCode status,
            String code,
            String message,
            String path
    ) {
        HttpStatus resolvedStatus =
                HttpStatus.resolve(status.value());

        String error = resolvedStatus == null
                ? "HTTP " + status.value()
                : resolvedStatus.getReasonPhrase();

        return new ApiErrorResponse(
                OffsetDateTime.now(),
                status.value(),
                error,
                code,
                message,
                path
        );
    }
}
