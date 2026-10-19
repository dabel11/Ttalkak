package com.ttalkak.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import com.ttalkak.common.exception.ApiException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PasswordResetMailerTest {
    @SuppressWarnings("unchecked")
    @Test void missingHostOrDisabledServiceCannotAdvertiseRecovery() {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mock(JavaMailSender.class));
        assertFalse(new PasswordResetMailer(provider, true, "from@example.com", "").isEnabled());
        assertFalse(new PasswordResetMailer(provider, false, "from@example.com", "smtp.example.com").isEnabled());
        assertThrows(ApiException.class, () -> new PasswordResetMailer(provider, false, "", "").requireEnabled());
    }
    @SuppressWarnings("unchecked")
    @Test void sendsCodeOnlyToRegisteredEmailAndSanitizesTransportFailure() {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(sender);
        when(provider.getObject()).thenReturn(sender);
        var mailer = new PasswordResetMailer(provider, true, "from@example.com", "smtp.example.com");
        mailer.send("registered@example.com", "fixture-reset-code");
        var capture = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(capture.capture());
        assertArrayEquals(new String[]{"registered@example.com"}, capture.getValue().getTo());
        assertTrue(capture.getValue().getText().contains("fixture-reset-code"));
        doThrow(new MailSendException("private transport details")).when(sender).send(any(SimpleMailMessage.class));
        var error = assertThrows(ApiException.class, () -> mailer.send("registered@example.com", "fixture-reset-code"));
        assertEquals("PASSWORD_RESET_DELIVERY_FAILED", error.getCode());
        assertFalse(error.getReason().contains("private"));
        assertNull(error.getCause());
    }

    @SuppressWarnings("unchecked")
    @Test void resendNeedsKeyAndSharedDomainNeedsRestrictedRecipient() {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        var gateway = mock(ResendMailGateway.class);
        when(gateway.isConfigured()).thenReturn(true);
        assertFalse(new PasswordResetMailer(provider, true, "onboarding@resend.dev", "", gateway,
                "resend", "").isEnabled());
        assertTrue(new PasswordResetMailer(provider, true, "onboarding@resend.dev", "", gateway,
                "resend", "owner@example.com").isEnabled());
        assertTrue(new PasswordResetMailer(provider, true, "noreply@example.com", "", gateway,
                "resend", "").isEnabled());
        when(gateway.isConfigured()).thenReturn(false);
        assertFalse(new PasswordResetMailer(provider, true, "noreply@example.com", "", gateway,
                "resend", "").isEnabled());
    }

    @SuppressWarnings("unchecked")
    @Test void testModeNeverRedirectsAnotherMembersResetOrId() {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        var gateway = mock(ResendMailGateway.class);
        when(gateway.isConfigured()).thenReturn(true);
        var mailer = new PasswordResetMailer(provider, true, "onboarding@resend.dev", "", gateway,
                "resend", "owner@example.com");
        assertThrows(ApiException.class, () -> mailer.send("other@example.com", "private-code"));
        assertThrows(ApiException.class, () -> mailer.sendUserId("other@example.com", "private-id"));
        verify(gateway, never()).send(anyString(), anyString(), anyString(), anyString());
        mailer.send("owner@example.com", "fixture-code");
        verify(gateway).send(eq("onboarding@resend.dev"), eq("owner@example.com"), anyString(),
                contains("fixture-code"));
        mailer.sendUserId("owner@example.com", "fixture-user");
        verify(gateway).send(eq("onboarding@resend.dev"), eq("owner@example.com"), anyString(),
                contains("fixture-user"));
        verifyNoInteractions(provider);
    }
}
