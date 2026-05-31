package com.ttalkak.auth;

import com.ttalkak.common.security.UserPrincipal;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;

@Slf4j
@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long accessTokenExpiry;
    private final long refreshTokenExpiry;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-expiry}") long accessTokenExpiry,
            @Value("${jwt.refresh-token-expiry}") long refreshTokenExpiry) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenExpiry = accessTokenExpiry;
        this.refreshTokenExpiry = refreshTokenExpiry;
    }

    public String createAccessToken(Long memberId, String email, String role) {
        return buildToken(memberId, email, role, "access", accessTokenExpiry);
    }

    public String createRefreshToken(Long memberId, String email, String role) {
        return buildToken(memberId, email, role, "refresh", refreshTokenExpiry);
    }

    private String buildToken(Long memberId, String email, String role, String type, long expiry) {
        Date now = new Date();
        return Jwts.builder()
                .subject(memberId.toString())
                .claim("email", email)
                .claim("role", role)
                .claim("type", type)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expiry))
                .signWith(secretKey)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("Expired JWT token");
        } catch (JwtException e) {
            log.debug("Invalid JWT token: {}", e.getMessage());
        }
        return false;
    }

    public boolean isAccessToken(String token) {
        Claims claims = parseClaims(token);
        return "access".equals(claims.get("type", String.class));
    }

    public Authentication getAuthentication(String token) {
        Claims claims = parseClaims(token);
        Long memberId = Long.parseLong(claims.getSubject());
        String email = claims.get("email", String.class);
        String role = claims.get("role", String.class);

        UserPrincipal principal = new UserPrincipal(memberId, email,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));

        return new UsernamePasswordAuthenticationToken(principal, token, principal.getAuthorities());
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
