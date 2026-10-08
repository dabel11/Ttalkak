package com.ttalkak.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BillingChargeRepository extends JpaRepository<BillingCharge, Long> {
    Optional<BillingCharge> findFirstByMemberIdAndStatusOrderByIdDesc(Long memberId, String status);
    Optional<BillingCharge> findFirstByMemberIdOrderByIdDesc(Long memberId);
    Optional<BillingCharge> findByOrderId(String orderId);
    long countByMemberId(Long memberId);
}
