package com.ttalkak.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BillingChargeRepository extends JpaRepository<BillingCharge, Long> {
    Optional<BillingCharge> findFirstByMemberIdAndStatusOrderByIdDesc(Long memberId, String status);
    Optional<BillingCharge> findFirstByMemberIdOrderByIdDesc(Long memberId);
    Optional<BillingCharge> findByOrderId(String orderId);
    long countByMemberId(Long memberId);
    @org.springframework.data.jpa.repository.Query("select b from BillingCharge b where b.memberId = :memberId "
            + "and coalesce(b.billingScope, 'test:legacy') = :scope and (:status is null or b.status = :status) order by b.id desc")
    java.util.List<BillingCharge> scopedCharges(@org.springframework.data.repository.query.Param("memberId") Long memberId,
            @org.springframework.data.repository.query.Param("scope") String scope,
            @org.springframework.data.repository.query.Param("status") String status, org.springframework.data.domain.Pageable page);
    @org.springframework.data.jpa.repository.Query("select count(b) from BillingCharge b where b.memberId = :memberId "
            + "and coalesce(b.billingScope, 'test:legacy') = :scope and b.refundState in ('REQUESTED', 'PENDING')")
    long openRefunds(@org.springframework.data.repository.query.Param("memberId") Long memberId,
                     @org.springframework.data.repository.query.Param("scope") String scope);
    @org.springframework.data.jpa.repository.Query("select count(b) from BillingCharge b where b.memberId = :memberId "
            + "and coalesce(b.billingScope, 'test:legacy') = :scope and b.refundState = 'PENDING'")
    long pendingRefunds(@org.springframework.data.repository.query.Param("memberId") Long memberId,
                        @org.springframework.data.repository.query.Param("scope") String scope);
    @org.springframework.data.jpa.repository.Query("select count(b) from BillingCharge b where b.memberId = :memberId "
            + "and coalesce(b.billingScope, 'test:legacy') = :scope and b.chargeKind = 'UPGRADE' "
            + "and b.status = 'DONE' and b.periodEnd = :end")
    long completedUpgrades(@org.springframework.data.repository.query.Param("memberId") Long memberId,
            @org.springframework.data.repository.query.Param("scope") String scope,
            @org.springframework.data.repository.query.Param("end") java.time.Instant end);
    @org.springframework.data.jpa.repository.Query("select b from BillingCharge b where "
            + "coalesce(b.billingScope, 'test:legacy') = :scope and b.refundState = :state order by b.id asc")
    java.util.List<BillingCharge> refundQueue(@org.springframework.data.repository.query.Param("scope") String scope,
            @org.springframework.data.repository.query.Param("state") String state, org.springframework.data.domain.Pageable page);
}
