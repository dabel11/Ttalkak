package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import jakarta.persistence.*;
import org.springframework.http.HttpStatus;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "billing_subscriptions", uniqueConstraints = {
        @UniqueConstraint(name = "uk_billing_member", columnNames = "member_id"),
        @UniqueConstraint(name = "uk_billing_customer", columnNames = "customer_key")})
public class BillingSubscription {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "member_id", nullable = false)
    private Long memberId;
    @Column(name = "customer_key", nullable = false, length = 50)
    private String customerKey;
    @Column(name = "billing_key", length = 200)
    private String billingKey;
    @Column(name = "auto_renew", nullable = false)
    private boolean autoRenew;
    @Column(name = "next_charge_at")
    private Instant nextChargeAt;

    protected BillingSubscription() {}
    BillingSubscription(Long memberId) {
        this.memberId = memberId;
        this.customerKey = UUID.randomUUID().toString();
    }
    public Long getMemberId() { return memberId; }
    public String getCustomerKey() { return customerKey; }
    String getBillingKey() { return billingKey; }
    boolean isAutoRenew() { return autoRenew; }
    Instant getNextChargeAt() { return nextChargeAt; }
    void register(String billingKey) {
        if (billingKey == null || billingKey.isBlank() || billingKey.length() > 200) throw new IllegalArgumentException("billingKey");
        this.billingKey = billingKey;
        this.autoRenew = true;
    }
    void paidUntil(Instant end) { this.nextChargeAt = end; }
    void cancelRenewal() { this.autoRenew = false; }
    void resume() {
        if (billingKey == null) throw new ApiException(
                HttpStatus.CONFLICT, "BILLING_CARD_REQUIRED", "등록된 카드가 없습니다.");
        this.autoRenew = true;
    }
}
