package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface GuestUsageReservationRepository extends JpaRepository<GuestUsageReservation, String> {
    List<GuestUsageReservation> findBySessionUuidHashAndStatusAndExpiresAtBefore(
            String sessionUuidHash, GuestUsageReservation.Status status, Instant now);
}
