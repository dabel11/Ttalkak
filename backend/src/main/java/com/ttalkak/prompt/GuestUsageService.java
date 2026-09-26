package com.ttalkak.prompt;

import com.ttalkak.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.locks.LockSupport;

@Service
public class GuestUsageService {
    private static final int LIMIT = 3;
    private static final int MAX_RETRIES = 20;
    private final GuestUsageRepository repository;
    private final GuestUsageReservationRepository reservations;
    private final TransactionTemplate transaction;
    private final Duration reservationTtl;

    public GuestUsageService(GuestUsageRepository repository,
                             GuestUsageReservationRepository reservations,
                             PlatformTransactionManager transactionManager,
                             @Value("${rag.response-timeout:75s}") Duration ragTimeout) {
        this.repository = repository;
        this.reservations = reservations;
        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.reservationTtl = ragTimeout.plusMinutes(2);
    }

    public Permit reserve(String sessionUuid) {
        String hash = hash(validate(sessionUuid));
        String reservationId = UUID.randomUUID().toString();
        retry(() -> {
            transaction.executeWithoutResult(status -> {
                GuestUsage usage = repository.findById(hash).orElseGet(() -> new GuestUsage(hash));
                for (GuestUsageReservation expired : reservations
                        .findBySessionUuidHashAndStatusAndExpiresAtBefore(
                                hash, GuestUsageReservation.Status.ACTIVE, Instant.now())) {
                    expired.finish(GuestUsageReservation.Status.EXPIRED);
                    usage.release();
                }
                if (usage.getUsageCount() + usage.getReservedCount() >= LIMIT) {
                    throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                            "FREE_TRIAL_LIMIT_EXCEEDED", "무료 체험 횟수를 모두 사용했습니다.");
                }
                usage.reserve();
                repository.saveAndFlush(usage);
                reservations.saveAndFlush(new GuestUsageReservation(
                        reservationId, hash, Instant.now().plus(reservationTtl)));
            });
        });
        return new Permit(hash, reservationId);
    }

    public void complete(Permit permit) {
        update(permit, true);
    }

    public void release(Permit permit) {
        update(permit, false);
    }

    private void update(Permit permit, boolean completed) {
        retry(() -> transaction.executeWithoutResult(status -> {
            GuestUsage usage = repository.findById(permit.sessionUuidHash())
                    .orElseThrow(() -> new IllegalStateException("Guest usage not found"));
            GuestUsageReservation reservation = reservations.findById(permit.reservationId())
                    .orElseThrow(() -> new IllegalStateException("Guest reservation not found"));
            if (!reservation.getSessionUuidHash().equals(permit.sessionUuidHash()))
                throw new IllegalStateException("Guest reservation mismatch");
            if (reservation.getStatus() != GuestUsageReservation.Status.ACTIVE) return;
            if (completed) usage.complete();
            else usage.release();
            repository.saveAndFlush(usage);
            reservation.finish(completed
                    ? GuestUsageReservation.Status.COMPLETED
                    : GuestUsageReservation.Status.RELEASED);
            reservations.saveAndFlush(reservation);
        }));
    }

    private void retry(Runnable operation) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                operation.run();
                return;
            } catch (ConcurrencyFailureException | DataIntegrityViolationException exception) {
                if (attempt == MAX_RETRIES - 1) throw exception;
                LockSupport.parkNanos(Math.min(20, attempt + 1) * 1_000_000L);
            }
        }
    }

    private String validate(String value) {
        if (value == null || value.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "SESSION_UUID_REQUIRED", "비로그인 사용에는 X-Session-UUID가 필요합니다.");
        }
        String normalized = value.trim();
        // Also accepts the Extension's legacy session-{time}-{random} fallback.
        if (normalized.length() < 8 || normalized.length() > 128
                || !normalized.matches("[A-Za-z0-9_-]+")) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "SESSION_UUID_INVALID", "X-Session-UUID 형식이 올바르지 않습니다.");
        }
        return normalized;
    }

    private String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    public record Permit(String sessionUuidHash, String reservationId) {}
}
