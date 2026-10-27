package com.ttalkak.auth;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

class PasswordResetDispatcherIdRecoveryTest {
    @Test
    void repeatedRequestsToTheSameEmailEnqueueOnlyOneDelivery() throws Exception {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var delivered = new CountDownLatch(1);
        doAnswer(invocation -> {
            delivered.countDown();
            return null;
        }).when(service).recoverUserId(anyString(), anyString());
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            dispatcher.recoverUserId("Name", "User@Example.com");
            dispatcher.recoverUserId("Name", "user@example.com");
            dispatcher.recoverUserId("Name", "USER@example.com");
            assertTrue(delivered.await(3, TimeUnit.SECONDS));
            verify(service, times(1)).recoverUserId("Name", "User@Example.com");
        } finally {
            dispatcher.close();
        }
    }

    @Test
    void wrongNameRequestCannotSuppressCorrectNameOnSameEmail() throws Exception {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var delivered = new CountDownLatch(2);
        doAnswer(invocation -> { delivered.countDown(); return null; })
                .when(service).recoverUserId(anyString(), anyString());
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            dispatcher.recoverUserId("Incorrect Name", "member@example.com");
            dispatcher.recoverUserId("Correct Name", "member@example.com");
            assertTrue(delivered.await(3, TimeUnit.SECONDS));
            verify(service).recoverUserId("Incorrect Name", "member@example.com");
            verify(service).recoverUserId("Correct Name", "member@example.com");
        } finally {
            dispatcher.close();
        }
    }

    @Test
    void independentEmailCanStillRequestRecovery() throws Exception {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var delivered = new CountDownLatch(2);
        doAnswer(invocation -> {
            delivered.countDown();
            return null;
        }).when(service).recoverUserId(anyString(), anyString());
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            dispatcher.recoverUserId("Name", "one@example.com");
            dispatcher.recoverUserId("Name", "two@example.com");
            assertTrue(delivered.await(3, TimeUnit.SECONDS));
            verify(service).recoverUserId("Name", "one@example.com");
            verify(service).recoverUserId("Name", "two@example.com");
        } finally {
            dispatcher.close();
        }
    }
}
