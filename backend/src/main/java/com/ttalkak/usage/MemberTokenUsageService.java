package com.ttalkak.usage;

import com.ttalkak.common.exception.ApiException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Objects;

@Service
public class MemberTokenUsageService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final MemberTokenUsageRepository repository;
    private final TransactionTemplate transaction;

    public MemberTokenUsageService(MemberTokenUsageRepository repository,
                                   PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** One requestKey is recorded at most once per member, including concurrent retries. */
    public void record(Long memberId, String requestKey, TokenCounts counts, Instant occurredAt) {
        requireMember(memberId);
        if (requestKey == null || requestKey.isBlank() || requestKey.trim().length() > 128) {
            throw new IllegalArgumentException("requestKey must contain 1-128 characters");
        }
        Objects.requireNonNull(counts, "counts");
        Objects.requireNonNull(occurredAt, "occurredAt");
        String key = requestKey.trim();
        try {
            transaction.executeWithoutResult(status -> {
                MemberTokenUsage previous = repository.findByMemberIdAndRequestKey(memberId, key)
                        .orElse(null);
                if (previous != null) {
                    verifySameCounts(previous, counts);
                    return;
                }
                repository.saveAndFlush(new MemberTokenUsage(memberId, key, counts, occurredAt));
            });
        } catch (DataIntegrityViolationException conflict) {
            // A concurrent request may have committed the same key first. Read after rollback.
            MemberTokenUsage previous = repository.findByMemberIdAndRequestKey(memberId, key)
                    .orElseThrow(() -> conflict);
            verifySameCounts(previous, counts);
        }
    }

    /** Half-open interval [start, end); suitable for both FREE calendar and PRO billing periods. */
    public Totals sum(Long memberId, Instant start, Instant end) {
        requireMember(memberId);
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        if (!start.isBefore(end)) throw new IllegalArgumentException("start must precede end");
        Object[] values = repository.sumInPeriod(memberId, start, end).get(0);
        return new Totals(((Number) values[0]).longValue(),
                ((Number) values[1]).longValue(),
                ((Number) values[2]).longValue(),
                ((Number) values[3]).longValue());
    }

    public Totals sumKstMonth(Long memberId, YearMonth month) {
        Objects.requireNonNull(month, "month");
        Instant start = month.atDay(1).atStartOfDay(SEOUL).toInstant();
        Instant end = month.plusMonths(1).atDay(1).atStartOfDay(SEOUL).toInstant();
        return sum(memberId, start, end);
    }

    private static void requireMember(Long memberId) {
        if (memberId == null || memberId <= 0) {
            throw new IllegalArgumentException("memberId must be positive");
        }
    }

    private static void verifySameCounts(MemberTokenUsage previous, TokenCounts counts) {
        if (previous.getInputTokens() != counts.inputTokens()
                || previous.getOutputTokens() != counts.outputTokens()
                || previous.getTotalTokens() != counts.totalTokens()) {
            throw new ApiException(HttpStatus.CONFLICT, "TOKEN_USAGE_REQUEST_CONFLICT",
                    "같은 요청의 토큰 사용량이 서로 다릅니다.");
        }
    }

    public record Totals(long inputTokens, long outputTokens, long totalTokens, long requests) {}
}
