package com.ttalkak.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "guest_usage_reservations", indexes =
        @Index(columnList = "sessionUuidHash,status,expiresAt"))
public class GuestUsageReservation {
    enum Status { ACTIVE, COMPLETED, RELEASED, EXPIRED }

    @Id
    @Column(length = 36)
    private String id;

    @Column(length = 64, nullable = false)
    private String sessionUuidHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(nullable = false)
    private Instant expiresAt;

    protected GuestUsageReservation() {}

    GuestUsageReservation(String id, String sessionUuidHash, Instant expiresAt) {
        this.id = id;
        this.sessionUuidHash = sessionUuidHash;
        this.expiresAt = expiresAt;
        this.status = Status.ACTIVE;
    }

    String getSessionUuidHash() { return sessionUuidHash; }
    Status getStatus() { return status; }
    void finish(Status next) { status = next; }
}
