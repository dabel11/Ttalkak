package com.ttalkak.usage;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Clock;

/** Reconciliation acknowledges reviewed accounting gaps; it never invents or deletes usage. */
@RestController
@RequestMapping("/api/admin/users/{memberId}/usage")
public class AdminUsageRecoveryController {
    private final MemberRepository members;
    private final MemberRequestLeaseRepository leases;
    private final UsagePeriodService periods;
    private final AdminAuditLogRepository audits;
    private final Clock clock;
    private final MemberTokenUsageRepository records;

    public AdminUsageRecoveryController(MemberRepository members, MemberRequestLeaseRepository leases,
            UsagePeriodService periods, AdminAuditLogRepository audits, Clock clock, MemberTokenUsageRepository records) {
        this.members = members;
        this.leases = leases;
        this.periods = periods;
        this.audits = audits;
        this.clock = clock;
        this.records = records;
    }

    @GetMapping
    @Transactional
    public Review review(@PathVariable Long memberId) {
        lockMember(memberId);
        return snapshot(memberId);
    }

    @PostMapping("/reconcile")
    @Transactional
    public Review reconcile(@PathVariable Long memberId, @RequestBody Resolution request,
            @AuthenticationPrincipal Member admin) {
        if (request == null || request.reason() == null || request.reason().isBlank()
                || request.reason().trim().length() > 1000 || request.expectedRevision() == null || request.expectedTotalTokens() == null
                || request.expectedRevision() < 0
                || request.expectedTotalTokens() < 0 || !request.recordsReviewed()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "USAGE_REVIEW_REQUIRED",
                    "사용량 기록 검토 확인과 1~1000자의 복구 사유가 필요합니다.");
        }
        lockMember(memberId);
        Review current = snapshot(memberId);
        if (current.requestInProgress()) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBER_REQUEST_IN_PROGRESS",
                    "AI 요청 처리 중에는 사용량 상태를 복구할 수 없습니다.");
        }
        if (current.uncertaintyRevision() != request.expectedRevision()
                || current.totalTokens() != request.expectedTotalTokens()) {
            throw new ApiException(HttpStatus.CONFLICT, "USAGE_REVIEW_STALE",
                    "사용량 상태가 변경되었습니다. 다시 조회하고 검토해 주세요.");
        }
        if (!current.usageUncertain()) return current;
        MemberRequestLease lease = leases.findById(memberId).orElseThrow();
        lease.reconcile();
        leases.save(lease);
        audits.save(new AdminAuditLog(admin.getId(), admin.getNickname(), "USAGE_RECONCILE", "USER",
                memberId, "검토한 확정 토큰: " + current.totalTokens() + ", 불확실 상태 번호: "
                + current.uncertaintyRevision() + ", 사유: " + request.reason().trim()));
        return snapshot(memberId);
    }

    private void lockMember(Long memberId) {
        members.lockById(memberId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                "MEMBER_NOT_FOUND", "회원을 찾을 수 없습니다."));
    }

    private Review snapshot(Long memberId) {
        MemberRequestLease lease = leases.findById(memberId).orElse(null);
        var usage = periods.current(memberId);
        return new Review(memberId, usage.totalTokens(), usage.requests(),
                lease != null && (lease.usageUncertain() || lease.abandoned()),
                lease != null && lease.activeAt(clock.instant()),
                lease == null ? 0 : lease.uncertaintyRevision(),
                records.findByMemberIdOrderByOccurredAtDesc(memberId, org.springframework.data.domain.PageRequest.of(0, 20))
                        .stream().map(r -> new UsageRecord(r.getRequestKey(), r.getOccurredAt(),
                                r.getInputTokens(), r.getOutputTokens(), r.getTotalTokens())).toList());
    }

    public record Review(Long memberId, long totalTokens, long requests, boolean usageUncertain,
                         boolean requestInProgress, long uncertaintyRevision, java.util.List<UsageRecord> recentRecords) {}
    public record UsageRecord(String requestKey, java.time.Instant occurredAt, long inputTokens,
                              long outputTokens, long totalTokens) {}
    public record Resolution(Long expectedRevision, Long expectedTotalTokens,
                             boolean recordsReviewed, String reason) {}
}
