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
    private final boolean trustedProxyRequired;

    public AuthRateLimitFilter(ApiErrorWriter errors) { this(errors, "", false); }

    public AuthRateLimitFilter(ApiErrorWriter errors, String trustedProxySecret) {
        this(errors, trustedProxySecret, false);
    }

    @Autowired
    public AuthRateLimitFilter(ApiErrorWriter errors,
                               @Value("${ttalkak.auth.trusted-proxy-secret:}") String trustedProxySecret,
                               @Value("${ttalkak.auth.trusted-proxy-required:false}") boolean trustedProxyRequired) {
        this.errors = errors;
        this.trustedProxySecret = trustedProxySecret == null ? "" : trustedProxySecret;
        this.trustedProxyRequired = trustedProxyRequired;
        if ((!this.trustedProxySecret.isEmpty() && !this.trustedProxySecret.matches("[A-Za-z0-9_-]{32,}"))
                || (trustedProxyRequired && this.trustedProxySecret.isEmpty())) {
            throw new IllegalStateException("Invalid authentication proxy configuration");
        }
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        if ("POST".equals(request.getMethod()) && PATHS.contains(request.getRequestURI())) {
            String identity = clientKey(request);
            if (identity == null) {
                errors.write(request, response, HttpStatus.SERVICE_UNAVAILABLE, "AUTH_PROXY_REQUIRED",
                        "인증 요청 경로를 확인할 수 없습니다.");
                return;
            }
            if (!allow(identity, request.getRequestURI(), System.currentTimeMillis())) {
                response.setHeader("Retry-After", "60");
                errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED",
                        "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
                return;
            }
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
            String presented = singleHeader(request, "X-Ttalkak-Proxy-Secret");
            String ip = singleHeader(request, "X-Ttalkak-Client-IP");
            String canonical = canonicalIpLiteral(ip);
            if (presented != null && constantTimeEqual(trustedProxySecret, presented) && canonical != null) {
                return canonical;
            }
        }
        return trustedProxyRequired ? null : unforwardedPeerAddress(request);
    }

    private static String singleHeader(HttpServletRequest request, String name) {
        java.util.Enumeration<String> values = request.getHeaders(name);
        if (values == null || !values.hasMoreElements()) return null;
        String value = values.nextElement();
        // HTTP header field coalescing also makes comma-separated credentials ambiguous.
        if (values.hasMoreElements() || value == null || value.indexOf(',') >= 0) return null;
        return value;
    }

    private static boolean constantTimeEqual(String expected, String actual) {
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private static String canonicalIpLiteral(String ip) {
        if (ip == null || ip.isBlank() || ip.length() > 45 || !ip.equals(ip.trim())
                || ip.indexOf(',') >= 0 || ip.indexOf('%') >= 0) return null;
        if (ip.indexOf(':') >= 0) {
            if (!ip.matches("[0-9a-fA-F:.]+")) return null;
            try {
                String canonical = InetAddress.getByName(ip).getHostAddress();
                return canonical.contains(":") ? canonical.toLowerCase(java.util.Locale.ROOT) : null;
            } catch (java.net.UnknownHostException ex) {
                return null;
            }
        }
        String[] parts = ip.split("\\.", -1);
        if (parts.length != 4) return null;
        for (String part : parts) {
            if (part.isEmpty() || part.length() > 3 || (part.length() > 1 && part.charAt(0) == '0')) return null;
            for (int i = 0; i < part.length(); i++) if (part.charAt(i) < '0' || part.charAt(i) > '9') return null;
            if (Integer.parseInt(part) > 255) return null;
        }
        return ip;
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
