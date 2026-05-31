package com.ttalkak.auth.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TokenResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType;
    private Long memberId;
    private String email;
    private String nickname;

    public static TokenResponse of(String accessToken, String refreshToken,
                                    Long memberId, String email, String nickname) {
        return TokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .memberId(memberId)
                .email(email)
                .nickname(nickname)
                .build();
    }
}
