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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ApiErrorWriter apiErrorWriter;
    private final List<String> allowedOriginPatterns;

	public SecurityConfig(
			JwtAuthenticationFilter jwtAuthenticationFilter,
			ApiErrorWriter apiErrorWriter,
			@Value("${ttalkak.cors.allowed-origin-patterns}")
			String allowedOriginPatterns
	) {
		this.jwtAuthenticationFilter = jwtAuthenticationFilter;
		this.apiErrorWriter = apiErrorWriter;
		this.allowedOriginPatterns = Arrays.stream(
						allowedOriginPatterns.split(",")
				)
				.map(String::trim)
				.filter(origin -> !origin.isBlank())
				.toList();
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
                                HttpMethod.POST,
                                "/api/prompts",
                                "/api/prompts/*/save",
                                "/api/prompts/*/like",
                                "/api/prompts/*/comments",
                                "/api/prompts/*/revision-requests",
                                "/api/comments/*/replies",
                                "/api/comments/*/like",
                                "/api/reports/**",
                                "/api/make/**"
                        ).hasRole("USER")

                        .requestMatchers(
                                HttpMethod.PATCH,
                                "/api/prompts/*",
                                "/api/prompts/*/visibility",
                                "/api/comments/*",
                                "/api/me/author-revision-requests/*/status",
                                "/api/make/**"
                        ).hasRole("USER")

                        .requestMatchers(
                                HttpMethod.DELETE,
                                "/api/prompts/*",
                                "/api/prompts/*/save",
                                "/api/prompts/*/like",
                                "/api/comments/*",
                                "/api/comments/*/like",
                                "/api/make/**"
                        ).hasRole("USER")

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

		config.setAllowedOriginPatterns(allowedOriginPatterns);

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
