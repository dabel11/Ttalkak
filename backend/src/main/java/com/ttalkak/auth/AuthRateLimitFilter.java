package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.util.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/auth/login", "/api/auth/signup", "/api/auth/google",
            "/api/auth/password-reset/request", "/api/auth/password-reset/complete", "/api/auth/password/change",
            "/api/auth/id-recovery/request", "/api/auth/find-id");
    private final AuthRequestLimiter limiter;
    private final ApiErrorWriter errors;
    private final String trustedProxySecret;
    private final boolean trustedProxyRequired;

    @Autowired
    public AuthRateLimitFilter(ApiErrorWriter errors,
                               @Value("${ttalkak.auth.trusted-proxy-secret:}") String trustedProxySecret,
                               @Value("${ttalkak.auth.trusted-proxy-required:false}") boolean trustedProxyRequired,
                               ServerProperties serverProperties, AuthRequestLimiter limiter) {
        // Native Tomcat forwarding rewrites the underlying request before the
        // servlet chain; unwrapping cannot recover the original socket peer.
        var strategy = serverProperties.getForwardHeadersStrategy();
        var remoteIp = serverProperties.getTomcat().getRemoteip();
        // Boot also enables RemoteIpValve for either explicit remoteip header,
        // even when the global strategy is none/framework. Reject implicit
        // strategy deduction too, since cloud defaults can enable native mode.
        if ((strategy != ServerProperties.ForwardHeadersStrategy.NONE
                && strategy != ServerProperties.ForwardHeadersStrategy.FRAMEWORK)
                || StringUtils.hasText(remoteIp.getRemoteIpHeader())
                || StringUtils.hasText(remoteIp.getProtocolHeader())) {
            throw new IllegalStateException(
                    "Native forwarded headers cannot preserve the authentication socket peer; use explicit none/framework without Tomcat remoteip headers");
        }
        this.errors = errors;
        this.limiter = java.util.Objects.requireNonNull(limiter);
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
        String authPath = unforwardedPath(request);
        if ("POST".equals(request.getMethod()) && PATHS.contains(authPath)) {
            String identity = clientKey(request);
            if (identity == null) {
                errors.write(request, response, HttpStatus.SERVICE_UNAVAILABLE, "AUTH_PROXY_REQUIRED",
                        "인증 요청 경로를 확인할 수 없습니다.");
                return;
            }
            boolean allowed;
            try { allowed = limiter.allow(identity, authPath); }
            catch (RuntimeException ex) {
                response.setHeader("Retry-After", "5");
                errors.write(request, response, HttpStatus.SERVICE_UNAVAILABLE, "AUTH_RATE_LIMIT_UNAVAILABLE",
                        "인증 요청을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.");
                return;
            }
            if (!allowed) {
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
        return unforwardedRequest(request).getRemoteAddr();
    }

    private static String unforwardedPath(HttpServletRequest request) {
        ServletRequest original = unforwardedRequest(request);
        HttpServletRequest http = original instanceof HttpServletRequest raw ? raw : request;
        // ForwardedHeaderFilter also rewrites URI/contextPath via X-Forwarded-Prefix.
        // Match the backend route, never an externally supplied public prefix.
        // The container decodes route characters before MVC mapping. Raw URI
        // comparison would miss /api/auth/%66ind-id even though MVC sees find-id.
        String servletPath = http.getServletPath();
        String pathInfo = http.getPathInfo();
        // With a DispatcherServlet prefix mapping, pathInfo is the MVC path
        // within that servlet; the configured mapping prefix is not a route.
        if (pathInfo != null) return pathInfo;
        if (!servletPath.isEmpty()) return servletPath;
        // Isolated request fixtures (or a root mapping) may omit servlet fields.
        // Decode exactly once, as the container does; malformed escapes fail closed.
        String uri = http.getRequestURI();
        String context = http.getContextPath();
        String path = !context.isEmpty() && uri.startsWith(context + "/") ? uri.substring(context.length()) : uri;
        return org.springframework.web.util.UriUtils.decode(path, StandardCharsets.UTF_8);
    }

    private static ServletRequest unforwardedRequest(HttpServletRequest request) {
        ServletRequest original = request;
        int unwrapCount = 0;
        while (original instanceof ServletRequestWrapper wrapper && unwrapCount++ < 32) {
            ServletRequest delegate = wrapper.getRequest();
            if (delegate == original) break;
            original = delegate;
        }
        return original;
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
                // InetAddress normalizes IPv4-mapped IPv6 to IPv4. Accept that
                // canonical form so valid proxy clients are neither rejected in
                // strict mode nor given a second quota for the mapped spelling.
                return canonical.toLowerCase(java.util.Locale.ROOT);
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

}
