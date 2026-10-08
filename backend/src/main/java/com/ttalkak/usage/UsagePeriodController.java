package com.ttalkak.usage;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/usage")
public class UsagePeriodController {
    private final AuthService authService;
    private final UsagePeriodService periods;

    private final MemberQuotaPolicy policy;
    private final MemberRequestGuard guard;

    public UsagePeriodController(AuthService authService, UsagePeriodService periods,
                                 MemberQuotaPolicy policy, MemberRequestGuard guard) {
        this.authService = authService;
        this.periods = periods;
        this.policy = policy;
        this.guard = guard;
    }

    @GetMapping
    public Snapshot current(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
        }
        var usage = periods.current(memberId);
        Long limit = policy.limit(usage.plan());
        Long remaining = limit == null ? null : Math.max(0L, limit - usage.totalTokens());
        boolean uncertain = guard.usageUncertain(memberId);
        return new Snapshot(usage.plan(), usage.periodStart(), usage.periodEnd(),
                usage.inputTokens(), usage.outputTokens(), usage.totalTokens(), usage.requests(),
                usage.totalTokens(), limit, remaining, limit != null && usage.totalTokens() >= limit,
                policy.enabled(), !uncertain, policy.enabled() && uncertain,
                usage.periodEnd());
    }
    public record Snapshot(String plan, java.time.Instant periodStart, java.time.Instant periodEnd,
                           long inputTokens, long outputTokens, long totalTokens, long requests,
                           long used, Long limit, Long remaining, boolean limitReached,
                           boolean quotaEnforced, boolean usageAvailable, boolean usageBlocked,
                           java.time.Instant resetsAt) {}
}
