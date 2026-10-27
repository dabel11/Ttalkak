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
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.util.Set;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/auth/login", "/api/auth/signup", "/api/auth/google",
            "/api/auth/password-reset/request", "/api/auth/password-reset/complete", "/api/auth/password/change",
            "/api/auth/id-recovery/request", "/api/auth/find-id");
    // A bounded, conservative count-min limiter avoids the unbounded identity map
    // and never evicts a live counter merely because a new address appears.
    // Collisions can cause false-positive throttling, never undercount an address.
    private static final int ROWS = 4;
    private static final int SLOTS = 1 << 16;
    private static final int MASK = SLOTS - 1;
    private final Window[][][] counters = new Window[2][ROWS][SLOTS];
    private final SecretKeySpec sketchHashKey = createSketchKey();
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
        String key = address + ":" + path;
        int limit = path.contains("password-reset") || path.contains("recovery")
                || path.endsWith("find-id") ? 10 : 30;
        int[] indices = indices(key);
        int[] minimum = {Integer.MAX_VALUE, Integer.MAX_VALUE};
        // Two staggered fixed windows close the full-minute boundary burst.
        // The shifted window crosses the other boundary at its midpoint.
        long[] epochs = {Math.floorDiv(now, 60_000L),
                Math.floorDiv(now - 30_000L, 60_000L)};
        for (int plane = 0; plane < 2; plane++) {
            for (int row = 0; row < ROWS; row++) {
                Window slot = counters[plane][row][indices[row]];
                if (slot == null || slot.startedAt != epochs[plane]) {
                    slot = new Window(epochs[plane]);
                    counters[plane][row][indices[row]] = slot;
                }
                minimum[plane] = Math.min(minimum[plane], slot.count);
            }
            if (minimum[plane] >= limit) return false;
        }
        for (int plane = 0; plane < 2; plane++) {
            for (int row = 0; row < ROWS; row++) {
                Window slot = counters[plane][row][indices[row]];
                if (slot.count == minimum[plane]) slot.count++;
            }
        }
        return true;
    }

    private static SecretKeySpec createSketchKey() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        return new SecretKeySpec(secret, "HmacSHA256");
    }

    private int[] indices(String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(sketchHashKey);
            byte[] digest = mac.doFinal(key.getBytes(StandardCharsets.UTF_8));
            int[] result = new int[ROWS];
            for (int row = 0; row < ROWS; row++) {
                int offset = row * 4;
                int hash = ((digest[offset] & 0xff) << 24) | ((digest[offset + 1] & 0xff) << 16)
                        | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
                result[row] = hash & MASK;
            }
            return result;
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to initialize secure rate limiter hash", ex);
        }
    }

    private static class Window {
        private final long startedAt;
        private int count;
        Window(long startedAt) { this.startedAt = startedAt; }
    }
}
