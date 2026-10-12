package com.ttalkak.billing;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.usage.MemberRequestLeaseRepository;
import com.ttalkak.usage.PaidUsagePeriodRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/** Human-reviewed, full renewal refunds only. No legal refund eligibility is inferred from usage. */
@Service
public class BillingRefundService {
    private final BillingChargeRepository charges;
    private final BillingSubscriptionRepository subscriptions;
    private final PaidUsagePeriodRepository periods;
    private final MemberRepository members;
    private final MemberRequestLeaseRepository leases;
    private final BillingContext context;
    private final BillingGateway gateway;
    private final AdminAuditLogRepository audits;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public BillingRefundService(BillingChargeRepository charges, BillingSubscriptionRepository subscriptions,
            PaidUsagePeriodRepository periods, MemberRepository members, MemberRequestLeaseRepository leases,
            BillingContext context, BillingGateway gateway, AdminAuditLogRepository audits,
            TransactionTemplate transactions, Clock clock) {
        this.charges = charges; this.subscriptions = subscriptions; this.periods = periods;
        this.members = members; this.leases = leases; this.context = context; this.gateway = gateway;
        this.audits = audits; this.transactions = transactions; this.clock = clock;
    }

    public List<ChargeView> history(Long memberId) {
        return charges.scopedCharges(memberId, context.scope(), null, PageRequest.of(0, 20))
                .stream().map(this::view).toList();
    }
    public List<ChargeView> queue(String state) {
        if (!java.util.Set.of("REQUESTED", "PENDING", "DONE", "REJECTED").contains(state)) {
            throw error(HttpStatus.BAD_REQUEST, "BILLING_REFUND_STATE_INVALID", "환불 상태를 확인해 주세요.");
        }
        return charges.refundQueue(context.scope(), state, PageRequest.of(0, 50)).stream().map(this::view).toList();
    }

    public ChargeView request(Long memberId, String orderId, String reason) {
        String reviewedReason = reason(reason);
        return transactions.execute(tx -> {
            lockMember(memberId);
            BillingCharge charge = owned(memberId, orderId);
            BillingSubscription subscription = lockSubscription(memberId);
            if (!"NONE".equals(charge.getRefundState())) return view(charge);
            if (!"DONE".equals(charge.getStatus()) || charge.getPaymentKey() == null) {
                throw error(HttpStatus.CONFLICT, "BILLING_REFUND_REQUIRES_PAYMENT", "승인이 확인된 결제만 환불을 요청할 수 있습니다.");
            }
            if (hasPendingPayment(memberId)) throw error(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                    "진행 중인 결제를 먼저 확인해 주세요.");
            // Requesting review never contacts the provider and does not revoke access.
            charge.requestRefund(reviewedReason);
            subscription.cancelRenewal();
            return view(charge);
        });
    }

    public ChargeView approve(String orderId, Integer expectedAmount, boolean reviewed, String reason, Member admin) {
        requireAdmin(admin);
        context.requireTest();
        String approvalReason = reason(reason);
        BillingCharge seed = find(orderId);
        Prepared prepared = transactions.execute(tx -> {
            lockMember(seed.getMemberId());
            lockSubscription(seed.getMemberId());
            BillingCharge charge = owned(seed.getMemberId(), orderId);
            if (!reviewed || expectedAmount == null || expectedAmount != charge.getAmount()) {
                throw error(HttpStatus.CONFLICT, "BILLING_REFUND_REVIEW_REQUIRED", "원 결제 금액과 환불 검토 확인이 필요합니다.");
            }
            if ("DONE".equals(charge.getRefundState())) return null;
            if (!java.util.Set.of("REQUESTED", "PENDING").contains(charge.getRefundState())) {
                throw error(HttpStatus.CONFLICT, "BILLING_REFUND_REQUEST_REQUIRED", "환불 요청 상태를 먼저 확인해 주세요.");
            }
            if (!supported(charge)) throw error(HttpStatus.CONFLICT, "BILLING_REFUND_MANUAL_REVIEW",
                    "업그레이드 또는 변경된 이용권은 별도 환불 처리가 필요합니다.");
            if (hasPendingPayment(charge.getMemberId())) throw error(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                    "진행 중인 결제를 먼저 확인해 주세요.");
            if (leases.findById(charge.getMemberId()).map(l -> l.activeAt(clock.instant()) || l.abandoned()).orElse(false)) {
                throw error(HttpStatus.CONFLICT, "MEMBER_REQUEST_IN_PROGRESS", "AI 요청 상태를 확인한 후 환불을 처리해 주세요.");
            }
            if ("REQUESTED".equals(charge.getRefundState())) {
                charge.approveRefund();
                audit(admin, charge, "BILLING_REFUND_APPROVE", approvalReason);
            }
            return new Prepared(charge.getMemberId(), orderId, charge.getPaymentKey(),
                    charge.getRefundIdempotencyKey(), charge.getAmount());
        });
        if (prepared == null) return view(find(orderId));
        return gateway.withinRequestBudget(() -> {
            BillingGateway.Payment payment = gateway.lookup(orderId);
            verifyIdentity(prepared, payment);
            if (!"CANCELED".equals(payment.status())) {
                if (!"DONE".equals(payment.status()) || payment.balanceAmount() == null
                        || payment.balanceAmount() != prepared.amount()) {
                    throw error(HttpStatus.CONFLICT, "BILLING_REFUND_MANUAL_REVIEW", "결제사 잔액이나 상태가 달라 재검토가 필요합니다.");
                }
                payment = gateway.cancel(prepared.paymentKey(), prepared.refundKey(), prepared.amount());
            }
            return complete(prepared, payment, admin);
        });
    }

    /** Read-only provider lookup. It never reissues a cancellation request. */
    public ChargeView reconcile(String orderId, Member admin) {
        requireAdmin(admin);
        context.requireTest();
        BillingCharge charge = find(orderId);
        if ("DONE".equals(charge.getRefundState())) return view(charge);
        if (!"PENDING".equals(charge.getRefundState())) throw error(HttpStatus.CONFLICT,
                "BILLING_REFUND_REQUEST_REQUIRED", "취소 확인 중인 주문만 재확인할 수 있습니다.");
        Prepared prepared = new Prepared(charge.getMemberId(), orderId, charge.getPaymentKey(),
                charge.getRefundIdempotencyKey(), charge.getAmount());
        return gateway.withinRequestBudget(() -> complete(prepared, gateway.lookup(orderId), admin));
    }

    public ChargeView reject(String orderId, String reason, Member admin) {
        requireAdmin(admin);
        String rejectedReason = reason(reason);
        BillingCharge seed = find(orderId);
        return transactions.execute(tx -> {
            lockMember(seed.getMemberId()); lockSubscription(seed.getMemberId());
            BillingCharge charge = owned(seed.getMemberId(), orderId);
            if (!"REQUESTED".equals(charge.getRefundState())) throw error(HttpStatus.CONFLICT,
                    "BILLING_REFUND_CANNOT_REJECT", "취소 확인 중인 주문은 거절할 수 없습니다.");
            charge.rejectRefund();
            audit(admin, charge, "BILLING_REFUND_REJECT", rejectedReason);
            return view(charge);
        });
    }

    private ChargeView complete(Prepared prepared, BillingGateway.Payment payment, Member admin) {
        verifyIdentity(prepared, payment);
        if (!"CANCELED".equals(payment.status()) || payment.balanceAmount() == null || payment.balanceAmount() != 0) {
            throw error(HttpStatus.BAD_GATEWAY, "BILLING_REFUND_UNCERTAIN", "전액 취소가 확인되지 않았습니다. 기존 요청을 재확인해 주세요.");
        }
        return transactions.execute(tx -> {
            lockMember(prepared.memberId());
            BillingSubscription subscription = lockSubscription(prepared.memberId());
            BillingCharge charge = owned(prepared.memberId(), prepared.orderId());
            if ("DONE".equals(charge.getRefundState())) return view(charge);
            if (!"PENDING".equals(charge.getRefundState())) throw error(HttpStatus.CONFLICT,
                    "BILLING_REFUND_REQUEST_REQUIRED", "환불 상태가 변경됐습니다.");
            var period = periods.findByPaymentReference(prepared.paymentKey()).orElseThrow(() ->
                    error(HttpStatus.CONFLICT, "BILLING_REFUND_ENTITLEMENT_MISSING", "이용권 대사가 필요합니다."));
            context.requireScope(period.getBillingScope());
            if (!prepared.memberId().equals(period.getMemberId())) throw error(HttpStatus.CONFLICT,
                    "BILLING_REFUND_ENTITLEMENT_MISMATCH", "이용권 대사가 필요합니다.");
            period.revoke(clock.instant());
            subscription.cancelRenewal();
            if (charge.getPeriodEnd().equals(subscription.getNextChargeAt())) subscription.paidUntil(null);
            charge.completeRefund(clock.instant());
            audit(admin, charge, "BILLING_REFUND_DONE", "전액 취소 확인 및 해당 이용권 회수");
            return view(charge);
        });
    }
    private void verifyIdentity(Prepared prepared, BillingGateway.Payment payment) {
        if (payment == null || !prepared.paymentKey().equals(payment.paymentKey())
                || !prepared.orderId().equals(payment.orderId()) || !"BILLING".equals(payment.type())
                || payment.totalAmount() != prepared.amount()) throw error(HttpStatus.BAD_GATEWAY,
                "BILLING_REFUND_UNCERTAIN", "원 결제 정보를 검증하지 못했습니다.");
    }
    private boolean supported(BillingCharge charge) {
        if (!"RENEWAL".equals(charge.getChargeKind()) || charges.completedUpgrades(
                charge.getMemberId(), context.scope(), charge.getPeriodEnd()) > 0) return false;
        return periods.findByPaymentReference(charge.getPaymentKey()).map(p ->
                context.matches(p.getBillingScope()) && charge.getMemberId().equals(p.getMemberId())
                        && charge.getPlan().name().equals(p.getPlanCode())
                        && p.getRequestLimitOverride() == null).orElse(false);
    }
    private boolean hasPendingPayment(Long memberId) {
        return !charges.scopedCharges(memberId, context.scope(), "PENDING", PageRequest.of(0, 1)).isEmpty();
    }
    private BillingCharge find(String orderId) {
        BillingCharge charge = charges.findByOrderId(orderId).orElseThrow(() ->
                error(HttpStatus.NOT_FOUND, "BILLING_ORDER_NOT_FOUND", "결제 주문을 찾을 수 없습니다."));
        context.requireScope(charge.getBillingScope());
        return charge;
    }
    private BillingCharge owned(Long memberId, String orderId) {
        BillingCharge charge = find(orderId);
        if (!memberId.equals(charge.getMemberId())) throw error(HttpStatus.NOT_FOUND,
                "BILLING_ORDER_NOT_FOUND", "결제 주문을 찾을 수 없습니다.");
        return charge;
    }
    private void lockMember(Long memberId) { members.lockById(memberId).orElseThrow(); }
    private BillingSubscription lockSubscription(Long memberId) {
        BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
        context.requireScope(subscription.getBillingScope());
        return subscription;
    }
    private void requireAdmin(Member admin) {
        if (admin == null || !"ADMIN".equals(admin.getRole())) throw error(HttpStatus.FORBIDDEN,
                "ADMIN_REQUIRED", "관리자 권한이 필요합니다.");
    }
    private String reason(String reason) {
        if (reason == null || reason.isBlank() || reason.trim().length() > 200) throw error(HttpStatus.BAD_REQUEST,
                "BILLING_REFUND_REASON_REQUIRED", "1~200자의 검토 사유가 필요합니다.");
        return reason.trim();
    }
    private void audit(Member admin, BillingCharge charge, String action, String reason) {
        audits.save(new AdminAuditLog(admin.getId(), admin.getNickname(), action, "USER",
                charge.getMemberId(), "주문: " + charge.getOrderId() + ", 금액: " + charge.getAmount() + ", 사유: " + reason));
    }
    private ChargeView view(BillingCharge charge) {
        return new ChargeView(charge.getOrderId(), charge.getMemberId(), charge.getPlan().name(), charge.getAmount(),
                charge.getChargeKind(), charge.getStatus(), charge.getRefundState(), charge.getRefundReason(),
                charge.getPeriodStart(), charge.getPeriodEnd(), charge.getRefundedAt());
    }
    private ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
    private record Prepared(Long memberId, String orderId, String paymentKey, String refundKey, int amount) {}
    public record ChargeView(String orderId, Long memberId, String plan, int amount, String kind,
                             String status, String refundState, String refundReason,
                             Instant periodStart, Instant periodEnd, Instant refundedAt) {}
}
