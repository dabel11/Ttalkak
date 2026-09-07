package com.ttalkak.auth;

import com.ttalkak.member.Member;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Optional;

@Service
public class JwtTokenService {

    private static final int MIN_SECRET_BYTES = 32;

    private final String secretBase64;
    private final long expirationMinutes;
    private final String issuer;

    private SecretKey signingKey;

    public JwtTokenService(
            @Value("${ttalkak.jwt.secret-base64:}")
            String secretBase64,
            @Value("${ttalkak.jwt.expiration-minutes:120}")
            long expirationMinutes,
            @Value("${ttalkak.jwt.issuer:ttalkak}")
            String issuer
    ) {
        this.secretBase64 = secretBase64;
        this.expirationMinutes = expirationMinutes;
        this.issuer = issuer;
    }

    @PostConstruct
    void initialize() {
        if (secretBase64 == null || secretBase64.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET_BASE64 환경변수를 설정해야 합니다."
            );
        }

        byte[] keyBytes;

        try {
            keyBytes = Decoders.BASE64.decode(secretBase64.trim());
        }
        catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "JWT_SECRET_BASE64는 올바른 Base64 값이어야 합니다.",
                    exception
            );
        }

        if (keyBytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET_BASE64는 디코딩 기준 최소 "
                            + MIN_SECRET_BYTES
                            + "바이트여야 합니다."
            );
        }

        if (expirationMinutes < 1) {
            throw new IllegalStateException(
                    "JWT_EXPIRATION_MINUTES는 1 이상이어야 합니다."
            );
        }

        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException(
                    "JWT_ISSUER를 비워둘 수 없습니다."
            );
        }

        signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public String issueToken(Member member) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(
                expirationMinutes,
                ChronoUnit.MINUTES
        );

        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(member.getId()))
                .claim("userId", member.getUserId())
                .claim("role", member.getRole())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
    }

    public Optional<Long> parseMemberId(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }

        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .requireIssuer(issuer)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String subject = claims.getSubject();

            if (subject == null || subject.isBlank()) {
                return Optional.empty();
            }

            return Optional.of(Long.parseLong(subject));
        }
        catch (JwtException | IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
