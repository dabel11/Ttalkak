package com.ttalkak.common.exception;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

public class ApiException extends ResponseStatusException {

    private final String code;
    private final Map<String, Object> details;

    public ApiException(
            HttpStatusCode status,
            String code,
            String message
    ) {
        this(status, code, message, Map.of());
    }

    public ApiException(
            HttpStatusCode status,
            String code,
            String message,
            Map<String, Object> details
    ) {
        super(status, message);
        this.code = code;
        this.details = details == null ? Map.of() : Map.copyOf(details);
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
