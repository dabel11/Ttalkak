package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/auth/login", "/api/auth/signup", "/api/auth/google",
            "/api/auth/password-reset/request", "/api/auth/password-reset/complete", "/api/auth/password/change",
            "/api/auth/id-recovery/request", "/api/auth/find-id");
    private final Map<String, Window> windows = new HashMap<>();
    private long lastCleanupAt = Long.MIN_VALUE;
    private final ApiErrorWriter errors;
    private final String trustedProxySecret;

    public AuthRateLimitFilter(ApiErrorWriter errors) { this(errors, ""); }

    @Autowired
    public AuthRateLimitFilter(ApiErrorWriter errors,
                               @Value("${ttalkak.auth.trusted-proxy-secret:}") String trustedProxySecret) {
        this.errors = errors;
        this.trustedProxySecret = trustedProxySecret == null ? "" : trustedProxySecret;
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        if ("POST".equals(request.getMethod()) && PATHS.contains(request.getRequestURI())
                && !allow(clientKey(request), request.getRequestURI(), System.currentTimeMillis())) {
            response.setHeader("Retry-After", "60");
            errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED",
                    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
            return;
        }
        chain.doFilter(request, response);
    }
    // Derive the socket peer from the innermost servlet request. Spring's
    // ForwardedHeaderFilter can replace getRemoteAddr() on outer wrappers,
    // even if an upstream proxy accidentally preserved client-supplied XFF.
    static String unforwardedPeerAddress(HttpServletRequest request) {
        ServletRequest original = request;
        int unwrapCount = 0;
        while (original instanceof ServletRequestWrapper wrapper && unwrapCount++ < 32) {
            ServletRequest delegate = wrapper.getRequest();
            if (delegate == original) break;
            original = delegate;
        }
        return original.getRemoteAddr();
    }

    String clientKey(HttpServletRequest request) {
        // Trust the edge-provided IP only if a separate internal proxy
        // authenticates its own hop using an explicitly configured secret.
        // Neither X-Forwarded-For nor X-Real-IP is trusted on its own.
        if (trustedProxySecret.length() >= 32) {
            String presented = request.getHeader("X-Ttalkak-Proxy-Secret");
            String ip = request.getHeader("X-Ttalkak-Client-IP");
            if (presented != null && constantTimeEqual(trustedProxySecret, presented) && isIpLiteral(ip)) {
                return ip;
            }
        }
        return unforwardedPeerAddress(request);
    }

    private static boolean constantTimeEqual(String expected, String actual) {
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isIpLiteral(String ip) {
        if (ip == null || ip.isBlank() || ip.length() > 45 || !ip.equals(ip.trim())
                || ip.indexOf(',') >= 0 || ip.indexOf('%') >= 0) return false;
        if (ip.indexOf(':') >= 0) {
            if (!ip.matches("[0-9a-fA-F:.]+")) return false;
            try {
                return InetAddress.getByName(ip).getHostAddress().contains(":");
            } catch (java.net.UnknownHostException ex) {
                return false;
            }
        }
        String[] parts = ip.split("\\.", -1);
        if (parts.length != 4) return false;
        for (String part : parts) {
            if (part.isEmpty() || part.length() > 3 || (part.length() > 1 && part.charAt(0) == '0')) return false;
            for (int i = 0; i < part.length(); i++) if (!Character.isDigit(part.charAt(i))) return false;
            if (Integer.parseInt(part) > 255) return false;
        }
        return true;
    }

    synchronized boolean allow(String address, String path, long now) {
        // Avoid a full map scan on every incoming request, especially under key-flood traffic.
        if (lastCleanupAt == Long.MIN_VALUE || now < lastCleanupAt || now - lastCleanupAt >= 1_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= 60_000);
            lastCleanupAt = now;
        }
        String key = address + ":" + path;
        Window window = windows.get(key);
        if (window != null && now - window.startedAt >= 60_000) {
            windows.remove(key);
            window = null;
        }
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
