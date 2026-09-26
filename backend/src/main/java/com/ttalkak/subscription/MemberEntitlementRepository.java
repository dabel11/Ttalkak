package com.ttalkak.subscription;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface MemberEntitlementRepository extends JpaRepository<MemberEntitlement, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select entitlement from MemberEntitlement entitlement where entitlement.memberId = :memberId")
    Optional<MemberEntitlement> findForUpdate(@Param("memberId") Long memberId);
}
