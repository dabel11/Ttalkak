package com.ttalkak.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BillingSubscriptionRepository extends JpaRepository<BillingSubscription, Long> {
    Optional<BillingSubscription> findByMemberId(Long memberId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from BillingSubscription b where b.memberId = :memberId")
    Optional<BillingSubscription> lockByMemberId(@Param("memberId") Long memberId);
    @Query("select b.memberId from BillingSubscription b where b.autoRenew = true and b.nextChargeAt <= :now")
    List<Long> dueMemberIds(@Param("now") Instant now);
}
