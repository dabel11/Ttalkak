package com.ttalkak.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.net.URL;
import java.util.List;
import java.util.Set;

@Component
public class GoogleIdTokenVerifier {

    private static final String GOOGLE_JWK_SET_URI =
            "https://www.googleapis.com/oauth2/v3/certs";

    private static final Set<String> ALLOWED_ISSUERS = Set.of(
            "https://accounts.google.com",
            "accounts.google.com"
    );

    private final String clientId;
    private final JwtDecoder jwtDecoder;

    @Autowired

    public GoogleIdTokenVerifier(
            @Value("${GOOGLE_CLIENT_ID:}") String clientId
    ) {
        this(clientId, createGoogleJwtDecoder());
    }

    GoogleIdTokenVerifier(
            String clientId,
            JwtDecoder jwtDecoder
    ) {
        this.clientId = clientId == null
                ? ""
                : clientId.trim();
        this.jwtDecoder = jwtDecoder;
    }

    public GoogleIdentity verify(String credential) {
        if (credential == null || credential.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Google ID 토큰을 입력해 주세요."
            );
        }

        if (clientId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Google 로그인이 설정되지 않았습니다."
            );
        }

        Jwt jwt;

        try {
            jwt = jwtDecoder.decode(credential.trim());
        }
        catch (JwtException exception) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "유효하지 않은 Google ID 토큰입니다."
            );
        }

        validateIssuer(jwt.getIssuer());
        validateAudience(jwt);

        String subject = normalizeClaim(jwt.getSubject());
        String email = normalizeClaim(
                jwt.getClaimAsString("email")
        );
        Boolean emailVerified = jwt.getClaimAsBoolean(
                "email_verified"
        );
        String name = normalizeClaim(
                jwt.getClaimAsString("name")
        );
        String picture = normalizeClaim(
                jwt.getClaimAsString("picture")
        );

        if (subject == null) {
            throw invalidToken(
                    "Google 사용자 식별자가 없습니다."
            );
        }

        if (email == null) {
            throw invalidToken(
                    "Google 이메일 정보가 없습니다."
            );
        }

        if (!Boolean.TRUE.equals(emailVerified)) {
            throw invalidToken(
                    "인증되지 않은 Google 이메일입니다."
            );
        }

        return new GoogleIdentity(
                subject,
                email,
                name,
                picture
        );
    }

    private void validateIssuer(URL issuer) {
        String value = issuer == null
                ? null
                : issuer.toString();

        if (value == null || !ALLOWED_ISSUERS.contains(value)) {
            throw invalidToken(
                    "Google 토큰 발급자가 올바르지 않습니다."
            );
        }
    }

    private void validateAudience(Jwt jwt) {
        List<String> audiences = jwt.getAudience();

        if (audiences == null || !audiences.contains(clientId)) {
            throw invalidToken(
                    "Google 토큰 대상이 올바르지 않습니다."
            );
        }

        if (audiences.size() > 1) {
            String authorizedParty = normalizeClaim(
                    jwt.getClaimAsString("azp")
            );

            if (!clientId.equals(authorizedParty)) {
                throw invalidToken(
                        "Google 토큰의 승인된 대상이 올바르지 않습니다."
                );
            }
        }
    }

    private String normalizeClaim(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private ResponseStatusException invalidToken(
            String message
    ) {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                message
        );
    }

    private static JwtDecoder createGoogleJwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(GOOGLE_JWK_SET_URI)
                .build();

        decoder.setJwtValidator(
                JwtValidators.createDefault()
        );

        return decoder;
    }

    public record GoogleIdentity(
            String subject,
            String email,
            String name,
            String picture
    ) {
    }
}
