package com.ttalkak.usage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface MemberTokenUsageRepository extends JpaRepository<MemberTokenUsage, Long> {
    List<MemberTokenUsage> findByMemberIdOrderByOccurredAtDesc(Long memberId, org.springframework.data.domain.Pageable page);
    Optional<MemberTokenUsage> findByMemberIdAndRequestKey(Long memberId, String requestKey);

    @Query("select coalesce(sum(u.inputTokens), 0), coalesce(sum(u.outputTokens), 0), "
            + "coalesce(sum(u.totalTokens), 0), count(u) from MemberTokenUsage u "
            + "where u.memberId = :memberId and u.occurredAt >= :start and u.occurredAt < :end")
    List<Object[]> sumInPeriod(@Param("memberId") Long memberId,
                         @Param("start") Instant start,
                         @Param("end") Instant end);
}
