package com.ttalkak.subscription;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface GuestUsageRepository extends JpaRepository<GuestUsage, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select usage from GuestUsage usage where usage.sessionUuid = :sessionUuid")
    Optional<GuestUsage> findForUpdate(@Param("sessionUuid") String sessionUuid);
}
