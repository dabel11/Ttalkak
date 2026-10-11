package com.ttalkak.usage;

import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.MemberRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;

/** A short DB transaction reserves one member invocation; no lock is held across HTTP. */
@Service
public class MemberRequestGuard {
    private final MemberRepository members;
    private final MemberRequestLeaseRepository leases;
    private final UsagePeriodService periods;
    private final MemberQuotaPolicy policy;
    private final Clock clock;
    private final Duration ttl;
    private final TransactionTemplate transaction;

    public MemberRequestGuard(MemberRepository members, MemberRequestLeaseRepository leases,
                              UsagePeriodService periods, MemberQuotaPolicy policy, Clock clock,
                              PlatformTransactionManager manager,
                              @Value("${rag.response-timeout:75s}") Duration timeout) {
        this.members = members;
        this.leases = leases;
        this.periods = periods;
        this.policy = policy;
        this.clock = clock;
        this.ttl = timeout.plusMinutes(2);
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public Permit acquire(Long memberId) {
        if (memberId == null) return null;
        return transaction.execute(tx -> {
            members.lockById(memberId).orElseThrow(() -> new ApiException(
                    HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다."));
            MemberRequestLease lease = leases.findById(memberId)
                    .orElseGet(() -> new MemberRequestLease(memberId));
            if (lease.activeAt(clock.instant())) {
                throw new ApiException(HttpStatus.CONFLICT, "MEMBER_REQUEST_IN_PROGRESS",
                        "이전 AI 요청을 처리 중입니다. 완료 후 다시 시도해 주세요.");
            }
            // A crashed or stalled worker may have consumed unreported tokens.
            if (lease.abandoned()) lease.uncertain();
            String id = UUID.randomUUID().toString();
            lease.acquire(id, clock.instant().plus(ttl));
            leases.saveAndFlush(lease);
            return new Permit(memberId, id);
        });
    }

    /** Call only after checking saved replays, immediately before a new RAG invocation. */
    public void checkQuota(Permit permit) {
        if (permit == null || (!policy.enabled() && !policy.requestQuotaEnabled())) return;
        MemberRequestLease lease = leases.findById(permit.memberId()).orElseThrow();
        if (!lease.owns(permit.id()) || !lease.activeAt(clock.instant())) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBER_REQUEST_IN_PROGRESS", "요청 상태를 다시 확인해 주세요.");
        }
        if (lease.usageUncertain()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MEMBER_USAGE_UNAVAILABLE",
                    "사용량을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
        }
        var snapshot = periods.at(permit.memberId(), clock.instant());
        if (policy.enabled() && snapshot.totalTokens() >= policy.limit(snapshot.plan())) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "MEMBER_TOKEN_LIMIT_EXCEEDED",
                    "현재 이용 기간의 AI 토큰 한도를 모두 사용했습니다.");
        }
        // Only one active member lease can pass this check. Successful metered
        // invocations are counted once by the (memberId, requestKey) unique key.
        Long countLimit = snapshot.requestLimitOverride() != null
                ? snapshot.requestLimitOverride() : policy.requestLimit(snapshot.plan());
        if (policy.requestQuotaEnabled() && snapshot.requests() >= countLimit) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "MEMBER_REQUEST_LIMIT_EXCEEDED",
                    "현재 이용 기간의 AI 요청 횟수를 모두 사용했습니다.");
        }
    }

    public void usageMissing(Permit permit) {
        if (permit == null) return;
        transaction.executeWithoutResult(tx -> {
            members.lockById(permit.memberId()).orElseThrow();
            MemberRequestLease lease = leases.findById(permit.memberId()).orElseThrow();
            // Even an old worker must flag unaccounted consumption after lease expiry.
            lease.uncertain();
            leases.saveAndFlush(lease);
        });
    }

    public boolean usageUncertain(Long memberId) {
        return leases.findById(memberId).map(MemberRequestLease::usageUncertain).orElse(false);
    }

    public void release(Permit permit) {
        if (permit == null) return;
        transaction.executeWithoutResult(tx -> {
            members.lockById(permit.memberId()).orElseThrow();
            MemberRequestLease lease = leases.findById(permit.memberId()).orElseThrow();
            if (lease.owns(permit.id())) {
                lease.release();
                leases.saveAndFlush(lease);
            }
        });
    }

    public record Permit(Long memberId, String id) {}
}
