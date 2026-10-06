package com.ttalkak.auth;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;

@Component
public class PasswordResetMailer {
    private final ObjectProvider<JavaMailSender> sender;
    private final boolean enabled;
    private final String from;
    private final String host;
    private final ResendMailGateway resend;
    private final String transport;
    private final String testRecipient;
    @Autowired
    public PasswordResetMailer(ObjectProvider<JavaMailSender> sender,
            @Value("${ttalkak.auth.password-reset-enabled:false}") boolean enabled,
            @Value("${ttalkak.auth.mail-from:}") String from,
            @Value("${spring.mail.host:}") String host,
            ResendMailGateway resend,
            @Value("${ttalkak.auth.mail-transport:smtp}") String transport,
            @Value("${ttalkak.auth.mail-test-recipient:}") String testRecipient) {
        this.sender = sender;
        this.enabled = enabled;
        this.from = from == null ? "" : from.trim();
        this.host = host;
        this.resend = resend;
        this.transport = transport == null ? "" : transport.trim().toLowerCase(Locale.ROOT);
        this.testRecipient = testRecipient == null ? "" : testRecipient.trim();
    }

    // Keep the existing SMTP-only unit test setup and configuration compatible.
    PasswordResetMailer(ObjectProvider<JavaMailSender> sender, boolean enabled, String from, String host) {
        this(sender, enabled, from, host, null, "smtp", "");
    }
    public boolean isEnabled() {
        if (!enabled || from.isBlank()) return false;
        if ("resend".equals(transport)) {
            // Resend's shared domain can only deliver to the account owner's email.
            boolean sharedDomain = from.toLowerCase(Locale.ROOT).contains("@resend.dev");
            return resend != null && resend.isConfigured() && (!sharedDomain || !testRecipient.isBlank());
        }
        return "smtp".equals(transport) && host != null && !host.isBlank()
                && sender.getIfAvailable() != null;
    }
    public void requireEnabled() {
        if (!isEnabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "PASSWORD_RESET_UNAVAILABLE", "비밀번호 재설정 메일 서비스가 설정되지 않았습니다.");
    }
    public void send(String email, String token) {
        deliver(email, "[딸깍] 비밀번호 재설정 코드",
                "비밀번호 재설정 화면에 다음 코드를 입력해주세요.\n\n" + token
                        + "\n\n15분 동안 한 번만 사용할 수 있습니다. 요청하지 않았다면 무시해주세요.");
    }
    public void sendUserId(String email, String userId) {
        deliver(email, "[딸깍] 아이디 찾기", "등록된 아이디: " + userId
                + "\n\n요청하지 않았다면 이 메일을 무시해주세요.");
    }
    private void deliver(String email, String subject, String text) {
        requireEnabled();
        if (!testRecipient.isBlank() && !testRecipient.equalsIgnoreCase(email)) {
            // Never redirect recovery credentials to the tester or another address.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_DELIVERY_FAILED", "메일 발송에 실패했습니다. 잠시 후 다시 요청해주세요.");
        }
        if ("resend".equals(transport)) {
            resend.send(from, email, subject, text);
            return;
        }
        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setFrom(from);
        mail.setTo(email);
        mail.setSubject(subject);
        mail.setText(text);
        try {
            sender.getObject().send(mail);
        } catch (org.springframework.mail.MailException exception) {
            // SMTP errors may contain message bodies; never expose/log reset credentials.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_DELIVERY_FAILED", "메일 발송에 실패했습니다. 잠시 후 다시 요청해주세요.");
        }
    }
}
