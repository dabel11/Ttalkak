package com.ttalkak.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthConfigurationController {
    private final String googleClientId;
    private final PasswordResetMailer mailer;

    public AuthConfigurationController(@Value("${GOOGLE_CLIENT_ID:}") String googleClientId, PasswordResetMailer mailer) {
        this.mailer = mailer;
        this.googleClientId = googleClientId == null ? "" : googleClientId.trim();
    }

    @GetMapping("/config")
    public Configuration configuration() {
        return new Configuration(!googleClientId.isEmpty(), googleClientId, mailer.isEnabled());
    }

    public record Configuration(boolean googleLoginEnabled, String googleClientId,
                                boolean passwordResetEnabled) { }
}
