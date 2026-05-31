package com.ttalkak.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class GoogleLoginRequest {

    @NotBlank(message = "Google ID 토큰이 필요합니다.")
    private String idToken;
}
