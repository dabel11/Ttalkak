package com.ttalkak.usage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface PaidUsagePeriodRepository extends JpaRepository<PaidUsagePeriod, Long> {
    Optional<PaidUsagePeriod> findFirstByMemberIdAndStartsAtLessThanEqualAndEndsAtGreaterThanAndRevokedAtIsNullOrderByStartsAtDesc(
            Long memberId, Instant startsAt, Instant endsAt);

    @Query("select max(p.endsAt) from PaidUsagePeriod p where p.memberId = :memberId "
            + "and p.endsAt <= :now and p.revokedAt is null")
    Optional<Instant> latestEndedAt(@Param("memberId") Long memberId, @Param("now") Instant now);

    @Query("select min(p.startsAt) from PaidUsagePeriod p where p.memberId = :memberId "
            + "and p.startsAt > :now and p.revokedAt is null")
    Optional<Instant> nextStartsAt(@Param("memberId") Long memberId, @Param("now") Instant now);
}
