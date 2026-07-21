package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final AuthService authService;
    private final ApiErrorWriter apiErrorWriter;

    public JwtAuthenticationFilter(
            AuthService authService,
            ApiErrorWriter apiErrorWriter
    ) {
        this.authService = authService;
        this.apiErrorWriter = apiErrorWriter;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization =
                request.getHeader("Authorization");

        if (SecurityContextHolder
                .getContext()
                .getAuthentication() == null) {
            try {
                authService
                        .getMemberFromAuthorization(authorization)
                        .ifPresent(this::setAuthentication);
            } catch (ApiException exception) {
                SecurityContextHolder.clearContext();

                apiErrorWriter.write(
                        request,
                        response,
                        HttpStatus.valueOf(
                                exception.getStatusCode().value()
                        ),
                        exception.getCode(),
                        exception.getReason() == null
                                ? "요청을 처리할 수 없습니다."
                                : exception.getReason()
                );

                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private void setAuthentication(Member member) {
        String role = member.getRole() == null
                ? "USER"
                : member.getRole().toUpperCase();

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        member,
                        null,
                        List.of(
                                new SimpleGrantedAuthority(
                                        "ROLE_" + role
                                )
                        )
                );

        SecurityContextHolder
                .getContext()
                .setAuthentication(authentication);
    }
}