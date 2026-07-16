package com.ttalkak.common.config;

import com.ttalkak.auth.JwtAuthenticationFilter;
import com.ttalkak.common.exception.ApiErrorWriter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ApiErrorWriter apiErrorWriter;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            ApiErrorWriter apiErrorWriter
    ) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.apiErrorWriter = apiErrorWriter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(
                        corsConfigurationSource()
                ))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS
                        )
                )

                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(
                                (request, response, exception) ->
                                        apiErrorWriter.write(
                                                request,
                                                response,
                                                HttpStatus.UNAUTHORIZED,
                                                "LOGIN_REQUIRED",
                                                "로그인이 필요합니다."
                                        )
                        )
                        .accessDeniedHandler(
                                (request, response, exception) -> {
                                String requestUri =
                                        request.getRequestURI();

                                boolean adminRequest =
                                        requestUri.equals("/api/admin")
                                                || requestUri.startsWith(
                                                        "/api/admin/"
                                                );

                                apiErrorWriter.write(
                                        request,
                                        response,
                                        HttpStatus.FORBIDDEN,
                                        adminRequest
                                                ? "ADMIN_ONLY"
                                                : "ACCESS_DENIED",
                                        adminRequest
                                                ? "관리자 권한이 필요합니다."
                                                : "접근 권한이 없습니다."
                                );
                                }
                        )
                )

                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                HttpMethod.OPTIONS,
                                "/**"
                        ).permitAll()
                        .requestMatchers(
                                "/api/auth/**"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/prompts",
                                "/api/prompts/*"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/prompts/*/view"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/prompts/improve"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/prompts/*/comments"
                        ).permitAll()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/tags/**"
                        ).permitAll()
                        .requestMatchers(
                                "/api/admin/**"
                        ).hasRole("ADMIN")
                        .anyRequest()
                        .authenticated()
                )
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .addFilterBefore(
                        jwtAuthenticationFilter,
                        UsernamePasswordAuthenticationFilter.class
                );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOriginPatterns(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*"
        ));

        config.setAllowedMethods(List.of(
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS"
        ));

        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", config);

        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
