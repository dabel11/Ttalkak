package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiException;
import jakarta.annotation.PreDestroy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Bounded background work keeps SMTP/account-existence timing out of HTTP responses. */
@Component
public class PasswordResetDispatcher {
    private final PasswordResetService service;
    private final PasswordResetMailer mailer;
    private final ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    // Bounded per-process duplicate request suppression, keyed by name + email.
    // The HTTP rate limiter remains the
    // primary control; multi-instance delivery limiting needs shared storage.
    private static final int MAX_RECOVERY_COOLDOWNS = 4096;
    private static final long RECOVERY_COOLDOWN_NANOS = java.util.concurrent.TimeUnit.MINUTES.toNanos(1);
    private final java.util.LinkedHashMap<String, Long> recoveryCooldowns = new java.util.LinkedHashMap<>();
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(PasswordResetDispatcher.class);
    public PasswordResetDispatcher(PasswordResetService service, PasswordResetMailer mailer) {
        this.service = service; this.mailer = mailer;
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("password-reset-");
        executor.initialize();
    }
    public void request(String userId, String email) {
        mailer.requireEnabled();
        if (userId == null || !userId.matches("[a-z0-9_-]{1,50}")
                || email == null || email.length() > 255
                || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "아이디와 이메일을 확인해주세요.");
        }
        try {
            executor.execute(() -> {
                try { service.request(userId, email); }
                catch (Exception exception) {
                    // Do not log SMTP exception contents, recipients or reset credentials.
                    log.warn("Password reset background delivery failed");
                }
            });
        } catch (org.springframework.core.task.TaskRejectedException exception) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED", "잠시 후 다시 요청해주세요.");
        }
    }
    @PreDestroy
    public void close() { executor.shutdown(); }
    public void recoverUserId(String name, String email) {
        mailer.requireEnabled();
        if (name == null || name.isBlank() || name.length() > 50 || email == null || email.length() > 255
                || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "이름과 이메일을 확인해주세요.");
        }
        String recipientKey = recoveryRequestKey(name, email);
        // Duplicates get the same accepted response, avoiding account-existence
        // disclosure and avoiding needless emails from repeated requests.
        if (!reserveRecoveryDelivery(recipientKey)) return;
        try {
            executor.execute(() -> {
                try { service.recoverUserId(name, email); }
                catch (Exception exception) { log.warn("User ID recovery delivery failed"); }
            });
        } catch (org.springframework.core.task.TaskRejectedException exception) {
            synchronized (recoveryCooldowns) { recoveryCooldowns.remove(recipientKey); }
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED", "잠시 후 다시 요청해주세요.");
        }
    }

    private boolean reserveRecoveryDelivery(String key) {
        synchronized (recoveryCooldowns) {
            long now = System.nanoTime();
            // Expire old entries so legitimate retries work and memory stays bounded.
            recoveryCooldowns.entrySet().removeIf(e -> now - e.getValue() >= RECOVERY_COOLDOWN_NANOS);
            if (recoveryCooldowns.containsKey(key)) return false;
            if (recoveryCooldowns.size() >= MAX_RECOVERY_COOLDOWNS) {
                // Never evict an unexpired reservation: doing so allows flood
                // traffic to bypass the cooldown for an earlier request.
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                        "AUTH_RATE_LIMITED", "잠시 후 다시 요청해주세요.");
            }
            recoveryCooldowns.put(key, now);
            return true;
        }
    }

    private static String recoveryRequestKey(String name, String email) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(
                    (name.trim() + "\\u0000" + email.trim().toLowerCase(java.util.Locale.ROOT))
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
    }
}
