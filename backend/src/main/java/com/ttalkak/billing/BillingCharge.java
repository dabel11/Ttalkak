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
    @Column(name = "plan_code", length = 16)
    private String planCode;
    @Column(name = "amount_krw")
    private Integer amountKrw;
    @Column(name = "charge_kind", length = 16)
    private String chargeKind;
    @Column(name = "upgrade_request_limit")
    private Long upgradeRequestLimit;

    @Column(name = "billing_scope", length = 80)
    private String billingScope;
    @Column(name = "refund_state", length = 16)
    private String refundState;
    @Column(name = "refund_reason", length = 200)
    private String refundReason;
    @Column(name = "refund_idempotency_key", length = 64)
    private String refundIdempotencyKey;
    @Column(name = "refunded_at")
    private Instant refundedAt;

    protected BillingCharge() {}
    BillingCharge(Long memberId, Instant start, Instant end) {
        this(memberId, start, end, BillingPlan.PRO, 4900, "RENEWAL");
    }

    BillingCharge(Long memberId, Instant start, Instant end, BillingPlan plan, int amount, String kind) {
        this(memberId, start, end, plan, amount, kind, BillingContext.LEGACY_TEST);
    }
    BillingCharge(Long memberId, Instant start, Instant end, BillingPlan plan, int amount, String kind, String scope) {
        this.billingScope = scope;
        if (amount < 1 || !java.util.Set.of("RENEWAL", "UPGRADE").contains(kind)) {
            throw new IllegalArgumentException("Invalid charge snapshot");
        }
        this.planCode = plan.name();
        this.amountKrw = amount;
        this.chargeKind = kind;
        this.memberId = memberId;
        this.periodStart = start;
        this.periodEnd = end;
        this.orderId = "ttalkak-" + UUID.randomUUID();
        this.status = "PENDING";
    }
    static BillingCharge upgrade(Long memberId, Instant start, Instant end,
                                 BillingPlan plan, int amount, long requestLimit) {
        if (requestLimit < 1) throw new IllegalArgumentException("Invalid request limit");
        BillingCharge charge = new BillingCharge(memberId, start, end, plan, amount, "UPGRADE");
        charge.upgradeRequestLimit = requestLimit;
        return charge;
    }
    String getBillingScope() { return billingScope; }
    void stampScope(String scope) { this.billingScope = scope; }
    String getPaymentKey() { return paymentKey; }
    String getRefundState() { return refundState == null ? "NONE" : refundState; }
    String getRefundReason() { return refundReason; }
    String getRefundIdempotencyKey() { return refundIdempotencyKey; }
    Instant getRefundedAt() { return refundedAt; }
    void requestRefund(String reason) {
        this.refundState = "REQUESTED";
        this.refundReason = reason;
        this.refundIdempotencyKey = "refund-" + UUID.randomUUID();
    }
    void approveRefund() { this.refundState = "PENDING"; }
    void rejectRefund() { this.refundState = "REJECTED"; }
    void completeRefund(Instant now) {
        this.refundState = "DONE";
        this.status = "CANCELED";
        this.refundedAt = now;
    }
    Long getUpgradeRequestLimit() { return upgradeRequestLimit; }
    Long getMemberId() { return memberId; }
    String getOrderId() { return orderId; }
    Instant getPeriodStart() { return periodStart; }
    Instant getPeriodEnd() { return periodEnd; }
    String getStatus() { return status; }
    BillingPlan getPlan() { return BillingPlan.parse(planCode); }
    int getAmount() { return amountKrw == null ? 4900 : amountKrw; }
    String getChargeKind() { return chargeKind == null ? "RENEWAL" : chargeKind; }
    void complete(String paymentKey) { this.paymentKey = paymentKey; this.status = "DONE"; }
    void fail() { this.status = "FAILED"; }
}
