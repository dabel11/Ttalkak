package com.ttalkak.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GoogleIdTokenVerifierTest {

    private static final String CLIENT_ID =
            "test-client.apps.googleusercontent.com";

    @Test
    void verifiesValidGoogleToken() {
        JwtDecoder decoder = token -> googleJwt(Map.of());

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        GoogleIdTokenVerifier.GoogleIdentity identity =
                verifier.verify("credential");

        assertEquals("google-subject-1", identity.subject());
        assertEquals("user@example.com", identity.email());
        assertEquals("테스트 사용자", identity.name());
        assertEquals(
                "https://example.com/profile.png",
                identity.picture()
        );
    }

    @Test
    void rejectsBlankCredential() {
        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(
                        CLIENT_ID,
                        token -> googleJwt(Map.of())
                );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify(" ")
        );

        assertEquals(
                HttpStatus.BAD_REQUEST,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsWhenGoogleClientIdIsMissing() {
        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(
                        "",
                        token -> googleJwt(Map.of())
                );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.SERVICE_UNAVAILABLE,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsDecoderFailure() {
        JwtDecoder decoder = token -> {
            throw new JwtException("invalid token");
        };

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsInvalidIssuer() {
        JwtDecoder decoder = token -> googleJwt(Map.of(
                "iss",
                "https://example.com"
        ));

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsInvalidAudience() {
        JwtDecoder decoder = token -> googleJwt(Map.of(
                "aud",
                List.of("another-client")
        ));

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @Test
    void requiresAzpForMultipleAudiences() {
        JwtDecoder decoder = token -> googleJwt(Map.of(
                "aud",
                List.of(CLIENT_ID, "another-client"),
                "azp",
                "another-client"
        ));

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsUnverifiedEmail() {
        JwtDecoder decoder = token -> googleJwt(Map.of(
                "email_verified",
                false
        ));

        GoogleIdTokenVerifier verifier =
                new GoogleIdTokenVerifier(CLIENT_ID, decoder);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> verifier.verify("credential")
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @org.junit.jupiter.api.Test
    void rejectsMissingOrExpiredTokenLifetime() {
        Jwt valid = googleJwt(Map.of());
        for (Instant expiration : java.util.Arrays.asList(null, Instant.now().minusSeconds(10))) {
            Jwt invalid = new Jwt("value", Instant.now().minusSeconds(20), expiration,
                    Map.of("alg", "RS256"), valid.getClaims());
            var verifier = new GoogleIdTokenVerifier(CLIENT_ID, token -> invalid);
            var error = assertThrows(ResponseStatusException.class, () -> verifier.verify("credential"));
            assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        }
    }
    @org.junit.jupiter.api.Test
    void acceptsGoogleIssuerWithoutScheme() {
        var verifier = new GoogleIdTokenVerifier(CLIENT_ID,
                token -> googleJwt(Map.of("iss", "accounts.google.com")));
        assertEquals("google-subject-1", verifier.verify("credential").subject());
    }

    private Jwt googleJwt(Map<String, Object> overrides) {
        Map<String, Object> claims = new LinkedHashMap<>();

        claims.put("iss", "https://accounts.google.com");
        claims.put("sub", "google-subject-1");
        claims.put("aud", List.of(CLIENT_ID));
        claims.put("email", "user@example.com");
        claims.put("email_verified", true);
        claims.put("name", "테스트 사용자");
        claims.put(
                "picture",
                "https://example.com/profile.png"
        );
        claims.putAll(overrides);

        Instant issuedAt = Instant.now();

        return new Jwt(
                "token-value",
                issuedAt,
                issuedAt.plusSeconds(300),
                Map.of("alg", "RS256"),
                claims
        );
    }
}
