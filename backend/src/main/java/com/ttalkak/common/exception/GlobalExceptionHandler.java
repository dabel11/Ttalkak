package com.ttalkak.common.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> handleApiException(
            ApiException exception,
            HttpServletRequest request
    ) {
        HttpStatusCode status = exception.getStatusCode();

        return build(
            status,
                exception.getCode(),
                messageOrDefault(
                        exception.getReason(),
                        defaultMessage(status)
                ),
                request
        );
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiErrorResponse> handleResponseStatusException(
            ResponseStatusException exception,
            HttpServletRequest request
    ) {
        HttpStatusCode status = exception.getStatusCode();

        return build(
                status,
                codeFor(status),
                messageOrDefault(
                        exception.getReason(),
                        defaultMessage(status)
                ),
                request
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodArgumentNotValidException(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        String message = exception
                .getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(error -> {
                    String reason = error.getDefaultMessage() == null
                            ? "입력값이 올바르지 않습니다."
                            : error.getDefaultMessage();

                    return error.getField() + ": " + reason;
                })
                .orElse("입력값이 올바르지 않습니다.");

        return build(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                message,
                request
        );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleHttpMessageNotReadableException(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST_BODY",
                "요청 본문을 읽을 수 없습니다.",
                request
        );
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingServletRequestParameterException(
            MissingServletRequestParameterException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "MISSING_PARAMETER",
                exception.getParameterName() + " 파라미터가 필요합니다.",
                request
        );
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodArgumentTypeMismatchException(
            MethodArgumentTypeMismatchException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_PARAMETER",
                exception.getName() + " 파라미터 형식이 올바르지 않습니다.",
                request
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgumentException(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                messageOrDefault(
                        exception.getMessage(),
                        "잘못된 요청입니다."
                ),
                request
        );
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiErrorResponse> handleOptimisticLockingFailureException(
            ObjectOptimisticLockingFailureException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "THREAD_CONCURRENTLY_UPDATED",
                "대화가 다른 요청에 의해 변경되었습니다. 최신 대화를 불러온 뒤 다시 시도해 주세요.",
                request
        );
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalStateException(
            IllegalStateException exception,
            HttpServletRequest request
    ) {
        return build(
                HttpStatus.CONFLICT,
                "INVALID_STATE",
                messageOrDefault(
                        exception.getMessage(),
                        "현재 상태에서는 처리할 수 없습니다."
                ),
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error(
                "Unhandled exception at {}",
                request.getRequestURI(),
                exception
        );

        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.",
                request
        );
    }

    private ResponseEntity<ApiErrorResponse> build(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        return ResponseEntity
                .status(status)
                .body(
                        ApiErrorResponse.of(
                                status,
                                code,
                                message,
                                request.getRequestURI()
                        )
                );
    }

    private String codeFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> "INVALID_REQUEST";
            case 401 -> "AUTHENTICATION_REQUIRED";
            case 403 -> "ACCESS_DENIED";
            case 404 -> "RESOURCE_NOT_FOUND";
            case 409 -> "CONFLICT";
            default -> status.is5xxServerError()
                    ? "INTERNAL_SERVER_ERROR"
                    : "REQUEST_FAILED";
        };
    }

    private String defaultMessage(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> "잘못된 요청입니다.";
            case 401 -> "로그인이 필요합니다.";
            case 403 -> "접근 권한이 없습니다.";
            case 404 -> "요청한 대상을 찾을 수 없습니다.";
            case 409 -> "현재 상태에서는 처리할 수 없습니다.";
            default -> status.is5xxServerError()
                    ? "서버 내부 오류가 발생했습니다."
                    : "요청을 처리할 수 없습니다.";
        };
    }

    private String messageOrDefault(
            String message,
            String defaultMessage
    ) {
        return message == null || message.isBlank()
                ? defaultMessage
                : message;
    }
}
