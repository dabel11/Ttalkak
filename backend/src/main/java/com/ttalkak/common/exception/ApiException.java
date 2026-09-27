package com.ttalkak.common.exception;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

public class ApiException extends ResponseStatusException {

    private final String code;

    public ApiException(
            HttpStatusCode status,
            String code,
            String message
    ) {
        super(status, message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}