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
    @Query("select p from PaidUsagePeriod p where p.memberId = :memberId "
            + "and coalesce(p.billingScope, 'test:legacy') = :scope and p.revokedAt is null "
            + "and p.startsAt <= :now and p.endsAt > :now order by p.startsAt desc")
    java.util.List<PaidUsagePeriod> activeForScope(@Param("memberId") Long memberId,
            @Param("now") Instant now, @Param("scope") String scope, org.springframework.data.domain.Pageable page);
    @Query("select max(p.endsAt) from PaidUsagePeriod p where p.memberId = :memberId "
            + "and coalesce(p.billingScope, 'test:legacy') = :scope and p.endsAt <= :now and p.revokedAt is null")
    Optional<Instant> latestEndedAt(@Param("memberId") Long memberId, @Param("now") Instant now,
                                  @Param("scope") String scope);
    @Query("select min(p.startsAt) from PaidUsagePeriod p where p.memberId = :memberId "
            + "and coalesce(p.billingScope, 'test:legacy') = :scope and p.startsAt > :now and p.revokedAt is null")
    Optional<Instant> nextStartsAt(@Param("memberId") Long memberId, @Param("now") Instant now,
                                 @Param("scope") String scope);
    Optional<PaidUsagePeriod> findByPaymentReference(String reference);
}
