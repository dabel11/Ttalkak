package com.ttalkak.billing;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "billing_charges", uniqueConstraints =
        @UniqueConstraint(name = "uk_billing_order", columnNames = "order_id"))
public class BillingCharge {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "member_id", nullable = false)
    private Long memberId;
    @Column(name = "order_id", nullable = false, length = 64)
    private String orderId;
    @Column(name = "period_start", nullable = false)
    private Instant periodStart;
    @Column(name = "period_end", nullable = false)
    private Instant periodEnd;
    @Column(name = "payment_key", length = 200)
    private String paymentKey;
    @Column(nullable = false, length = 16)
    private String status;

    protected BillingCharge() {}
    BillingCharge(Long memberId, Instant start, Instant end) {
        this.memberId = memberId;
        this.periodStart = start;
        this.periodEnd = end;
        this.orderId = "ttalkak-" + UUID.randomUUID();
        this.status = "PENDING";
    }
    Long getMemberId() { return memberId; }
    String getOrderId() { return orderId; }
    Instant getPeriodStart() { return periodStart; }
    Instant getPeriodEnd() { return periodEnd; }
    String getStatus() { return status; }
    void complete(String paymentKey) { this.paymentKey = paymentKey; this.status = "DONE"; }
    void fail() { this.status = "FAILED"; }
}
