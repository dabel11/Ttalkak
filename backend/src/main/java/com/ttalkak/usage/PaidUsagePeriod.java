package com.ttalkak.usage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.Objects;

/** A confirmed paid entitlement. A payment callback, not a client request, may create one. */
@Entity
@Table(name = "paid_usage_periods",
        uniqueConstraints = @UniqueConstraint(name = "uk_paid_usage_payment_ref",
                columnNames = "payment_reference"),
        indexes = @Index(name = "idx_paid_usage_member_period",
                columnList = "member_id,starts_at,ends_at"))
public class PaidUsagePeriod {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "payment_reference", nullable = false, length = 128)
    private String paymentReference;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected PaidUsagePeriod() {}

    PaidUsagePeriod(Long memberId, String paymentReference, Instant startsAt, Instant endsAt) {
        if (memberId == null || memberId <= 0) throw new IllegalArgumentException("memberId");
        if (paymentReference == null || paymentReference.isBlank()
                || paymentReference.length() > 128) throw new IllegalArgumentException("paymentReference");
        if (!Objects.requireNonNull(startsAt).isBefore(Objects.requireNonNull(endsAt))) {
            throw new IllegalArgumentException("Paid period must have positive duration");
        }
        this.memberId = memberId;
        this.paymentReference = paymentReference;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }

    void revoke(Instant when) { this.revokedAt = Objects.requireNonNull(when); }

    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
}
