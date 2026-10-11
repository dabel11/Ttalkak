package com.ttalkak.usage;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Objects;

@Service
public class UsagePeriodService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final PaidUsagePeriodRepository periods;
    private final MemberTokenUsageService usage;

    public UsagePeriodService(PaidUsagePeriodRepository periods, MemberTokenUsageService usage) {
        this.periods = periods;
        this.usage = usage;
    }

    public Snapshot current(Long memberId) {
        return at(memberId, Instant.now());
    }

    public Snapshot at(Long memberId, Instant now) {
        Objects.requireNonNull(now, "now");
        if (memberId == null || memberId <= 0) throw new IllegalArgumentException("memberId");

        var active = periods
                .findFirstByMemberIdAndStartsAtLessThanEqualAndEndsAtGreaterThanAndRevokedAtIsNullOrderByStartsAtDesc(
                        memberId, now, now);
        String plan;
        Instant start;
        Instant end;
        Long requestLimitOverride = null;
        if (active.isPresent()) {
            plan = active.get().getPlanCode();
            requestLimitOverride = active.get().getRequestLimitOverride();
            start = active.get().getStartsAt();
            end = active.get().getEndsAt();
        } else {
            plan = "FREE";
            YearMonth month = YearMonth.from(now.atZone(SEOUL));
            start = month.atDay(1).atStartOfDay(SEOUL).toInstant();
            end = month.plusMonths(1).atDay(1).atStartOfDay(SEOUL).toInstant();
            // Paid usage earlier this month does not consume the subsequent FREE allowance.
            Instant previousPaidEnd = periods.latestEndedAt(memberId, now).orElse(start);
            if (previousPaidEnd.isAfter(start)) start = previousPaidEnd;
            Instant nextPaidStart = periods.nextStartsAt(memberId, now).orElse(end);
            if (nextPaidStart.isBefore(end)) end = nextPaidStart;
        }
        Instant sumEnd = now.isBefore(end) ? now : end;
        MemberTokenUsageService.Totals totals = start.isBefore(sumEnd)
                ? usage.sum(memberId, start, sumEnd)
                : new MemberTokenUsageService.Totals(0, 0, 0, 0);
        return new Snapshot(plan, start, end, totals.inputTokens(), totals.outputTokens(),
                totals.totalTokens(), totals.requests(), requestLimitOverride);
    }

    public record Snapshot(String plan, Instant periodStart, Instant periodEnd,
                           long inputTokens, long outputTokens, long totalTokens, long requests,
                           Long requestLimitOverride) {}
}
