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
        try {
            executor.execute(() -> {
                try { service.recoverUserId(name, email); }
                catch (Exception exception) { log.warn("User ID recovery delivery failed"); }
            });
        } catch (org.springframework.core.task.TaskRejectedException exception) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "AUTH_RATE_LIMITED", "잠시 후 다시 요청해주세요.");
        }
    }
}
