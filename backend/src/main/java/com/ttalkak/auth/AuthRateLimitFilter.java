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
    // Independent, bounded backstop: forwarded-IP spoofing cannot create unlimited requests.
    private final Map<String, Window> globalWindows = new HashMap<>();
    private final Map<String, Window> overflowWindows = new HashMap<>();
    private long lastCleanupAt = Long.MIN_VALUE;
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
        // Avoid a full map scan on every incoming request, especially under key-flood traffic.
        if (lastCleanupAt == Long.MIN_VALUE || now < lastCleanupAt || now - lastCleanupAt >= 1_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= 60_000);
            lastCleanupAt = now;
        }
        int limit = path.contains("password-reset") || path.contains("recovery") || path.endsWith("find-id") ? 10 : 30;
        // A global ceiling remains effective even if a proxy incorrectly trusts attacker XFF.
        int globalLimit = limit == 10 ? 100 : 600;
        Window global = currentWindow(globalWindows, path, now);
        if (global.count >= globalLimit) return false;
        String key = address + ":" + path;
        Window window = windows.get(key);
        if (window != null && now - window.startedAt >= 60_000) {
            windows.remove(key);
            window = null;
        }
        if (window == null) {
            if (windows.size() >= 10_000) {
                // Never evict live per-IP counters. New keys share a strictly capped
                // overflow bucket instead of locking all new users out.
                Window overflow = currentWindow(overflowWindows, path, now);
                if (overflow.count >= limit) return false;
                overflow.count++;
                global.count++;
                return true;
            }
            window = new Window(now);
            windows.put(key, window);
        }
        if (window.count >= limit) return false;
        window.count++;
        global.count++;
        return true;
    }
    private static Window currentWindow(Map<String, Window> buckets, String path, long now) {
        Window current = buckets.get(path);
        if (current == null || now < current.startedAt || now - current.startedAt >= 60_000) {
            current = new Window(now);
            buckets.put(path, current);
        }
        return current;
    }
    private static class Window {
        private final long startedAt;
        private int count;
        Window(long startedAt) { this.startedAt = startedAt; }
    }
}
