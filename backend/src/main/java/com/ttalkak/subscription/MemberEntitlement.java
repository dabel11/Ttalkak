package com.ttalkak.subscription;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "member_entitlements")
public class MemberEntitlement {
    @Id
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(nullable = false, length = 16)
    private String plan = "FREE";

    @Column(nullable = false, length = 24)
    private String status = "ACTIVE";

    @Column(name = "usage_date", nullable = false)
    private LocalDate usageDate;

    @Column(name = "used_today", nullable = false)
    private int usedToday;

    private LocalDateTime currentPeriodEnd;

    @Column(nullable = false)
    private boolean cancelAtPeriodEnd;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected MemberEntitlement() {}

    public MemberEntitlement(Long memberId, LocalDate today, LocalDateTime now) {
        this.memberId = memberId;
        this.usageDate = today;
        this.updatedAt = now;
    }

    public void resetUsageIfNeeded(LocalDate today, LocalDateTime now) {
        if (!today.equals(usageDate)) {
            usageDate = today;
            usedToday = 0;
            updatedAt = now;
        }
    }

    public int incrementUsage(LocalDateTime now) {
        usedToday += 1;
        updatedAt = now;
        return usedToday;
    }

    public void applySubscription(String plan, String status, LocalDateTime currentPeriodEnd, boolean cancelAtPeriodEnd, LocalDateTime now) {
        this.plan = plan;
        this.status = status;
        this.currentPeriodEnd = currentPeriodEnd;
        this.cancelAtPeriodEnd = cancelAtPeriodEnd;
        this.updatedAt = now;
    }

    public Long getMemberId() { return memberId; }
    public String getPlan() { return plan; }
    public String getStatus() { return status; }
    public LocalDate getUsageDate() { return usageDate; }
    public int getUsedToday() { return usedToday; }
    public LocalDateTime getCurrentPeriodEnd() { return currentPeriodEnd; }
    public boolean isCancelAtPeriodEnd() { return cancelAtPeriodEnd; }
}
