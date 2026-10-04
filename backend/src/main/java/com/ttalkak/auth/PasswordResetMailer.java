package com.ttalkak.auth;

import org.springframework.beans.factory.ObjectProvider;
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
    public PasswordResetMailer(ObjectProvider<JavaMailSender> sender,
            @Value("${ttalkak.auth.password-reset-enabled:false}") boolean enabled,
            @Value("${ttalkak.auth.mail-from:}") String from,
            @Value("${spring.mail.host:}") String host) {
        this.sender = sender;
        this.enabled = enabled;
        this.from = from;
        this.host = host;
    }
    public boolean isEnabled() {
        return enabled && host != null && !host.isBlank() && from != null && !from.isBlank()
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
