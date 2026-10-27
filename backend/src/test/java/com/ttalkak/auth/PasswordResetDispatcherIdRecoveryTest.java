package com.ttalkak.auth;

import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PasswordResetDispatcherIdRecoveryTest {
    @Test
    void validRequestIsDispatchedAndNeitherRecipientNorIdsAreReturned() throws Exception {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var delivered = new CountDownLatch(1);
        doAnswer(invocation -> { delivered.countDown(); return null; })
                .when(service).recoverUserId(anyString(), anyString());
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            dispatcher.recoverUserId("Name", "member@example.com");
            assertTrue(delivered.await(3, TimeUnit.SECONDS));
            verify(service).recoverUserId("Name", "member@example.com");
        } finally {
            dispatcher.close();
        }
    }

    @Test
    void invalidRequestDoesNotQueueDelivery() {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            assertThrows(ApiException.class,
                    () -> dispatcher.recoverUserId(" ", "member@example.com"));
            assertThrows(ApiException.class,
                    () -> dispatcher.recoverUserId("Name", "invalid-email"));
            verifyNoInteractions(service);
        } finally {
            dispatcher.close();
        }
    }

    @Test
    void wrongNameCannotReserveOrBlockCorrectName() throws Exception {
        var service = mock(PasswordResetService.class);
        var mailer = mock(PasswordResetMailer.class);
        var processed = new CountDownLatch(2);
        doAnswer(invocation -> { processed.countDown(); return null; })
                .when(service).recoverUserId(anyString(), anyString());
        var dispatcher = new PasswordResetDispatcher(service, mailer);
        try {
            dispatcher.recoverUserId("Incorrect Name", "member@example.com");
            dispatcher.recoverUserId("Correct Name", "member@example.com");
            assertTrue(processed.await(3, TimeUnit.SECONDS));
            verify(service).recoverUserId("Correct Name", "member@example.com");
        } finally {
            dispatcher.close();
        }
    }
}
