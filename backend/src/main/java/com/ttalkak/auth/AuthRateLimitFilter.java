package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/auth/login", "/api/auth/signup", "/api/auth/google",
            "/api/auth/password-reset/request", "/api/auth/password-reset/complete", "/api/auth/password/change",
            "/api/auth/id-recovery/request", "/api/auth/find-id");
    private final Map<String, Window> windows = new HashMap<>();
    private final ApiErrorWriter errors;
    public AuthRateLimitFilter(ApiErrorWriter errors) { this.errors = errors; }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        if ("POST".equals(request.getMethod()) && PATHS.contains(request.getRequestURI())
                && !allow(request.getRemoteAddr(), request.getRequestURI(), System.currentTimeMillis())) {
            response.setHeader("Retry-After", "60");
            errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED",
                    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
            return;
        }
        chain.doFilter(request, response);
    }
    synchronized boolean allow(String address, String path, long now) {
        windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= 60_000);
        String key = address + ":" + path;
        Window window = windows.get(key);
        if (window == null) {
            if (windows.size() >= 10_000) return false;
            window = new Window(now);
            windows.put(key, window);
        }
        int limit = path.contains("password-reset") || path.contains("recovery") || path.endsWith("find-id") ? 10 : 30;
        return ++window.count <= limit;
    }
    private static class Window {
        private final long startedAt;
        private int count;
        Window(long startedAt) { this.startedAt = startedAt; }
    }
}
