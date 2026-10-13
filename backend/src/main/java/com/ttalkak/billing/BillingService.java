package com.ttalkak.billing;

import com.ttalkak.common.exception.ApiException;
import com.ttalkak.usage.PaidUsagePeriod;
import com.ttalkak.usage.PaidUsagePeriodRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

@Service
public class BillingService {
    private static final Logger log = LoggerFactory.getLogger(BillingService.class);
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final BillingSubscriptionRepository subscriptions;
    private final BillingChargeRepository charges;
    private final PaidUsagePeriodRepository periods;
    private final BillingGateway gateway;
    private final TransactionTemplate transactions;
    private final String clientKey;
    private final String secretKey;
    private final int amount;
    private final Clock clock;
    private final BillingContext context;

    public BillingService(BillingSubscriptionRepository subscriptions, BillingChargeRepository charges,
            PaidUsagePeriodRepository periods, BillingGateway gateway, TransactionTemplate transactions,
            @Value("${ttalkak.billing.toss-client-key:}") String clientKey,
            @Value("${ttalkak.billing.toss-secret-key:}") String secretKey,
            @Value("${ttalkak.billing.monthly-price-krw:9900}") int amount, Clock clock, BillingContext context) {
        this.subscriptions = subscriptions;
        this.charges = charges;
        this.periods = periods;
        this.gateway = gateway;
        this.transactions = transactions;
        this.clientKey = clientKey;
        this.secretKey = secretKey;
        this.amount = amount;
        this.clock = clock;
        this.context = context;
    }

    private void configured() {
        context.requireTest();
        if (!clientKey.startsWith("test_ck_") || !secretKey.startsWith("test_sk_") || amount != BillingPlan.PRO.amount()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "BILLING_NOT_CONFIGURED",
                    "테스트 결제 키와 월 결제 금액을 설정해야 합니다.");
        }
    }

    public Setup setup(Long memberId) {
        return setup(memberId, null);
    }

    /** Selected plan is server-priced; an active paid plan may only change via a paid upgrade. */
    public Setup setup(Long memberId, String planCode) {
        configured();
        BillingPlan selected = planCode == null ? null : BillingPlan.parse(planCode);
        BillingSubscription subscription = transactions.execute(tx -> {
            BillingSubscription found = subscriptions.findByMemberId(memberId)
                    .orElseGet(() -> subscriptions.saveAndFlush(new BillingSubscription(memberId, context.scope())));
            BillingSubscription locked = subscriptions.lockByMemberId(memberId).orElseThrow();
            context.requireScope(locked.getBillingScope());
            if (selected != null && locked.getPlan() != selected) {
                boolean active = locked.getNextChargeAt() != null
                        && locked.getNextChargeAt().isAfter(clock.instant());
                boolean pending = pending(memberId).isPresent();
                if (pending) {
                    throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                            "진행 중인 결제를 먼저 확인해 주세요.");
                }
                // An active paid tier is immutable until a verified upgrade payment.
                // Reading its setup for an upgrade preview must not change the tier.
                if (!active) locked.selectPlan(selected);
            }
            return locked;
        });
        BillingPlan plan = subscription.getPlan();
        return new Setup(clientKey, subscription.getCustomerKey(), price(plan),
                subscription.getBillingKey() != null, plan.name());
    }

    public Status status(Long memberId) {
        BillingCharge pending = pending(memberId)
                .orElse(null);
        PendingCharge pendingInfo = pending == null ? null
                : new PendingCharge(pending.getChargeKind(), pending.getPlan().name(), pending.getAmount());
        return subscriptions.findByMemberId(memberId)
                .filter(s -> context.matches(s.getBillingScope()))
                .map(s -> {
                    String paymentStatus = paymentStatus(s);
                    return new Status(s.getBillingKey() != null, s.isAutoRenew(), s.getNextChargeAt(),
                            paymentStatus, "REFUNDED".equals(paymentStatus) ? "FREE" : s.getPlan().name(), pendingInfo);
                })
                .orElseGet(() -> new Status(false, false, null, "NOT_REGISTERED", "FREE", null));
    }

    private String paymentStatus(BillingSubscription subscription) {
        Long memberId = subscription.getMemberId();
        if (pending(memberId).isPresent()) {
            return "PENDING";
        }
        if (latest(memberId).map(c -> "CANCELED".equals(c.getStatus())).orElse(false)
                && activePeriod(memberId, clock.instant()).isEmpty()) return "REFUNDED";
        if (subscription.getNextChargeAt() != null && subscription.getNextChargeAt().isAfter(clock.instant())) {
            return "ACTIVE";
        }
        if (subscription.getBillingKey() == null) return "NOT_REGISTERED";
        if (latest(memberId)
                .map(charge -> "FAILED".equals(charge.getStatus())).orElse(false)) return "FAILED";
        return subscription.getNextChargeAt() == null ? "PENDING" : "EXPIRED";
    }

    public Status completeRegistration(Long memberId, String customerKey, String authKey) {
        return gateway.withinRequestBudget(() -> completeRegistrationWithinBudget(memberId, customerKey, authKey));
    }

    private Status completeRegistrationWithinBudget(Long memberId, String customerKey, String authKey) {
        configured();
        BillingSubscription subscription = subscriptions.findByMemberId(memberId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED", "먼저 결제 등록을 시작해 주세요."));
        context.requireScope(subscription.getBillingScope());
        ensureNoRefund(memberId);
        if (!subscription.getCustomerKey().equals(customerKey) || authKey == null || authKey.isBlank()
                || authKey.length() > 300) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BILLING_AUTH_INVALID", "카드 인증 정보를 확인해 주세요.");
        }
        if (subscription.getBillingKey() == null) {
            String billingKey = gateway.issueBillingKey(authKey, customerKey);
            transactions.executeWithoutResult(tx -> {
                BillingSubscription locked = subscriptions.lockByMemberId(memberId).orElseThrow();
                context.requireScope(locked.getBillingScope());
                if (locked.getBillingKey() == null) locked.register(billingKey);
            });
        }
        charge(memberId);
        return status(memberId);
    }

    public Status retry(Long memberId) {
        return gateway.withinRequestBudget(() -> retryWithinBudget(memberId));
    }

    private Status retryWithinBudget(Long memberId) {
        configured();
        transactions.executeWithoutResult(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId)
                    .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED", "등록된 카드가 없습니다."));
            context.requireScope(subscription.getBillingScope());
            ensureNoRefund(memberId);
            subscription.resume();
        });
        charge(memberId);
        return status(memberId);
    }

    public Status cancelRenewal(Long memberId) {
        transactions.executeWithoutResult(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId)
                    .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED", "등록된 구독이 없습니다."));
            context.requireScope(subscription.getBillingScope());
            subscription.cancelRenewal();
        });
        return status(memberId);
    }

    @Scheduled(fixedDelayString = "${ttalkak.billing.poll-ms:60000}",
            initialDelayString = "${ttalkak.billing.poll-ms:60000}")
    public void chargeDue() {
        if (!context.testEnabled() || !clientKey.startsWith("test_ck_") || !secretKey.startsWith("test_sk_")) return;
        for (Long memberId : subscriptions.dueMemberIds(clock.instant(), context.scope())) {
            try {
                gateway.withinRequestBudget(() -> { charge(memberId); return null; });
            } catch (RuntimeException e) {
                // Do not log provider responses, billing keys, or card data.
                log.warn("Billing poll failed for member {}: {}", memberId, e.getClass().getSimpleName());
            }
        }
    }

    void charge(Long memberId) {
        configured();
        Prepared prepared = transactions.execute(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
            context.requireScope(subscription.getBillingScope());
            if (charges.openRefunds(memberId, context.scope()) > 0) return null;
            if (!subscription.isAutoRenew() || subscription.getBillingKey() == null) return null;
            Instant now = clock.instant();
            if (subscription.getNextChargeAt() != null && subscription.getNextChargeAt().isAfter(now)) return null;
            var previous = pending(memberId);
            if (previous.isPresent() && "UPGRADE".equals(previous.get().getChargeKind())) return null;
            BillingCharge pending = previous.orElseGet(() -> {
                        Instant start = now;
                        Instant end = start.atZone(SEOUL).plusMonths(1).toInstant();
                        BillingPlan plan = subscription.getPlan();
                        return charges.saveAndFlush(new BillingCharge(memberId, start, end,
                                plan, price(plan), "RENEWAL", context.scope()));
                    });
            return new Prepared(subscription.getBillingKey(), subscription.getCustomerKey(),
                    pending.getOrderId(), previous.isPresent(), pending.getPlan(), pending.getAmount());
        });
        if (prepared == null) return;

        BillingGateway.Payment payment;
        try {
            payment = prepared.retry() ? gateway.lookup(prepared.orderId()) : null;
            if (payment == null) {
                payment = gateway.charge(prepared.billingKey(), prepared.customerKey(),
                        prepared.orderId(), prepared.amount(), "TTALKAK " + prepared.plan().name() + " monthly");
            }
        } catch (BillingDeclinedException e) {
            boolean declined = Boolean.TRUE.equals(transactions.execute(tx -> {
                BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
            context.requireScope(subscription.getBillingScope());
                BillingCharge attempt = charges.findByOrderId(prepared.orderId()).orElseThrow();
                // A parallel worker may already have confirmed this order.
                if (!attempt.getStatus().equals("PENDING")) return false;
                attempt.fail();
                subscription.cancelRenewal();
                return true;
            }));
            if (!declined) return;
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_PAYMENT_FAILED", "결제 승인에 실패했습니다.");
        }
        if (payment == null || !"DONE".equals(payment.status()) || !"BILLING".equals(payment.type())
                || !prepared.orderId().equals(payment.orderId()) || payment.totalAmount() != prepared.amount()
                || payment.paymentKey() == null || payment.paymentKey().isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN",
                    "결제 결과를 검증하지 못했습니다. 같은 주문으로 재확인해야 합니다.");
        }
        BillingGateway.Payment confirmedPayment = payment;
        transactions.executeWithoutResult(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
            context.requireScope(subscription.getBillingScope());
            BillingCharge attempt = charges.findByOrderId(prepared.orderId()).orElseThrow();
            if (attempt.getStatus().equals("DONE")) return;
            if (!attempt.getStatus().equals("PENDING")) throw new IllegalStateException("Charge is not pending");
            periods.saveAndFlush(new PaidUsagePeriod(memberId, confirmedPayment.paymentKey(),
                    attempt.getPeriodStart(), attempt.getPeriodEnd(), attempt.getPlan().name(), context.scope()));
            attempt.complete(confirmedPayment.paymentKey());
            subscription.paidUntil(attempt.getPeriodEnd());
        });
    }

    /**
     * Upgrade the current paid term without resetting its start/end dates.
     * The additional fee and additional calls are both proportional to remaining time.
     * The next recurring charge uses the selected tier's full monthly price.
     */
    public UpgradeQuote upgradeQuote(Long memberId, String planCode) {
        BillingPlan target = BillingPlan.parse(planCode);
        var pending = pending(memberId);
        if (pending.isPresent()) {
            BillingCharge order = pending.get();
            if (!"UPGRADE".equals(order.getChargeKind()) || order.getPlan() != target) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                        "이전 결제의 확인이 필요합니다.");
            }
            Instant now = clock.instant();
            var active = activePeriod(memberId, now).orElseThrow(() -> new ApiException(
                            HttpStatus.CONFLICT, "BILLING_PERIOD_EXPIRED", "이용 기간이 만료됐습니다."));
            return new UpgradeQuote(active.getPlanCode(), target.name(), order.getAmount(),
                    price(target), order.getUpgradeRequestLimit(), order.getPeriodEnd());
        }
        return quoteAt(memberId, target, clock.instant());
    }

    private UpgradeQuote quoteAt(Long memberId, BillingPlan target, Instant now) {
        var active = activePeriod(memberId, now).orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT, "BILLING_UPGRADE_REQUIRES_ACTIVE",
                        "진행 중인 유료 구독이 있어야 업그레이드할 수 있습니다."));
        BillingPlan current = BillingPlan.parse(active.getPlanCode());
        if (target.ordinal() <= current.ordinal()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BILLING_UPGRADE_INVALID",
                    "현재 요금제보다 높은 등급만 업그레이드할 수 있습니다.");
        }
        long total = java.time.Duration.between(active.getStartsAt(), active.getEndsAt()).toMillis();
        long remaining = java.time.Duration.between(now, active.getEndsAt()).toMillis();
        if (total <= 0 || remaining <= 0) {
            throw new ApiException(HttpStatus.CONFLICT, "BILLING_PERIOD_EXPIRED",
                    "현재 결제 기간이 만료됐습니다.");
        }
        // Integer-ceiling of remaining-term fees and additional entitlements.
        long fractionNumerator = Math.min(total, remaining);
        int difference = price(target) - price(current);
        if (difference < 1) throw new IllegalArgumentException("Tier prices must increase");
        int dueNow = Math.toIntExact((difference * fractionNumerator + total - 1) / total);
        long oldAllowance = active.getRequestLimitOverride() == null
                ? current.monthlyRequests() : active.getRequestLimitOverride();
        long delta = target.monthlyRequests() - current.monthlyRequests();
        long extra = (delta * fractionNumerator + total - 1) / total;
        long revisedLimit = Math.min(target.monthlyRequests(), oldAllowance + extra);
        return new UpgradeQuote(current.name(), target.name(), dueNow, price(target),
                revisedLimit, active.getEndsAt());
    }

    public Status upgrade(Long memberId, String planCode, Integer expectedAmount) {
        return gateway.withinRequestBudget(() -> upgradeWithinBudget(memberId, planCode, expectedAmount));
    }

    private Status upgradeWithinBudget(Long memberId, String planCode, Integer expectedAmount) {
        configured();
        BillingPlan target = BillingPlan.parse(planCode);
        if (expectedAmount == null || expectedAmount <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BILLING_UPGRADE_QUOTE_REQUIRED",
                    "추가 결제 금액을 먼저 확인해 주세요.");
        }
        PreparedUpgrade prepared = transactions.execute(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId)
                    .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED",
                            "등록된 구독이 없습니다."));
            context.requireScope(subscription.getBillingScope());
            ensureNoRefund(memberId);
            if (subscription.getBillingKey() == null) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_CARD_REQUIRED",
                        "카드를 먼저 등록해 주세요.");
            }
            var previous = pending(memberId);
            BillingCharge pending;
            boolean retry;
            if (previous.isPresent()) {
                pending = previous.get();
                if (!"UPGRADE".equals(pending.getChargeKind())
                        || pending.getPlan() != target || pending.getAmount() != expectedAmount) {
                    throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                            "진행 중인 다른 결제가 있습니다. 먼저 결제 상태를 확인해 주세요.");
                }
                retry = true;
            } else {
                UpgradeQuote quote = quoteAt(memberId, target, clock.instant());
                if (quote.amount() != expectedAmount) {
                    throw new ApiException(HttpStatus.CONFLICT, "BILLING_UPGRADE_QUOTE_CHANGED",
                            "남은 기간이 변경됐습니다. 추가 결제 금액을 다시 확인해 주세요.");
                }
                pending = charges.saveAndFlush(BillingCharge.upgrade(memberId, clock.instant(),
                        quote.periodEnd(), target, quote.amount(), quote.requestLimitAfterUpgrade()));
                pending.stampScope(context.scope());
                retry = false;
            }
            return new PreparedUpgrade(subscription.getBillingKey(), subscription.getCustomerKey(),
                    pending.getOrderId(), pending.getAmount(), retry);
        });
        BillingGateway.Payment payment;
        try {
            payment = prepared.retry() ? gateway.lookup(prepared.orderId()) : null;
            if (payment == null) {
                payment = gateway.charge(prepared.billingKey(), prepared.customerKey(),
                        prepared.orderId(), prepared.amount(), "TTALKAK " + target.name() + " upgrade");
            }
        } catch (BillingDeclinedException declined) {
            transactions.executeWithoutResult(tx -> {
                subscriptions.lockByMemberId(memberId).orElseThrow();
                BillingCharge pending = charges.findByOrderId(prepared.orderId()).orElseThrow();
                if ("PENDING".equals(pending.getStatus())) pending.fail();
            });
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UPGRADE_PAYMENT_FAILED",
                    "업그레이드 결제 승인이 거절됐습니다. 기존 요금제는 유지됩니다.");
        }
        completeUpgradePayment(memberId, prepared.orderId(), prepared.amount(), payment);
        return status(memberId);
    }

    /**
     * Read-only provider reconciliation of an existing UPGRADE order after a reload.
     * Never calls charge(): uncertain payments must not create a second charge.
     */
    public Status reconcileUpgrade(Long memberId) {
        return gateway.withinRequestBudget(() -> {
            configured();
            BillingCharge pending = pending(memberId)
                    .orElse(null);
            if (pending == null) return status(memberId);
            if (!"UPGRADE".equals(pending.getChargeKind())) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                        "진행 중인 다른 종류의 결제입니다.");
            }
            BillingGateway.Payment payment = gateway.lookup(pending.getOrderId());
            if (payment == null || !"DONE".equals(payment.status())) return status(memberId);
            completeUpgradePayment(memberId, pending.getOrderId(), pending.getAmount(), payment);
            return status(memberId);
        });
    }

    private void completeUpgradePayment(Long memberId, String orderId, int expectedAmount,
                                        BillingGateway.Payment payment) {
        if (payment == null || !"DONE".equals(payment.status()) || !"BILLING".equals(payment.type())
                || !orderId.equals(payment.orderId())
                || payment.totalAmount() != expectedAmount
                || payment.paymentKey() == null || payment.paymentKey().isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN",
                    "결제 결과를 확인할 수 없습니다. 같은 주문으로 재확인해 주세요.");
        }
        transactions.executeWithoutResult(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
            context.requireScope(subscription.getBillingScope());
            BillingCharge charge = charges.findByOrderId(orderId).orElseThrow();
            if (!memberId.equals(charge.getMemberId()) || !"UPGRADE".equals(charge.getChargeKind())
                    || charge.getAmount() != expectedAmount) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                        "현재 계정의 업그레이드 주문이 아닙니다.");
            }
            if ("DONE".equals(charge.getStatus())) return;
            if (!"PENDING".equals(charge.getStatus())) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_PAYMENT_PENDING",
                        "업그레이드 주문 상태가 변경됐습니다.");
            }
            Instant now = clock.instant();
            var active = activePeriod(memberId, now).orElseThrow(() -> new ApiException(
                            HttpStatus.BAD_GATEWAY, "BILLING_UPGRADE_RECONCILIATION_REQUIRED",
                            "결제는 확인됐으나 이용 기간이 만료됐습니다. 관리자 확인이 필요합니다."));
            if (!active.getEndsAt().equals(charge.getPeriodEnd())) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UPGRADE_RECONCILIATION_REQUIRED",
                        "이용 기간이 변경돼 결제 대사가 필요합니다.");
            }
            active.upgradeTo(charge.getPlan().name(), charge.getUpgradeRequestLimit());
            subscription.selectPlan(charge.getPlan());
            charge.complete(payment.paymentKey());
        });
    }

    private java.util.Optional<BillingCharge> pending(Long memberId) {
        return charges.scopedCharges(memberId, context.scope(), "PENDING",
                org.springframework.data.domain.PageRequest.of(0, 1)).stream().findFirst();
    }
    private java.util.Optional<BillingCharge> latest(Long memberId) {
        return charges.scopedCharges(memberId, context.scope(), null,
                org.springframework.data.domain.PageRequest.of(0, 1)).stream().findFirst();
    }
    private java.util.Optional<PaidUsagePeriod> activePeriod(Long memberId, Instant now) {
        return periods.activeForScope(memberId, now, context.scope(),
                org.springframework.data.domain.PageRequest.of(0, 1)).stream().findFirst();
    }
    private void ensureNoRefund(Long memberId) {
        if (charges.openRefunds(memberId, context.scope()) > 0) throw new ApiException(
                HttpStatus.CONFLICT, "BILLING_REFUND_REVIEW_PENDING", "환불 검토가 진행 중입니다.");
    }

    private record PreparedUpgrade(String billingKey, String customerKey, String orderId,
                                   int amount, boolean retry) {}
    public record UpgradeQuote(String fromPlan, String targetPlan, int amount, int nextMonthlyAmount,
                               long requestLimitAfterUpgrade, Instant periodEnd) {}

    private record Prepared(String billingKey, String customerKey, String orderId,
                            boolean retry, BillingPlan plan, int amount) {}
    public record Setup(String clientKey, String customerKey, int amount, boolean cardRegistered, String plan) {}
    public record PendingCharge(String kind, String plan, int amount) {}
    public record Status(boolean cardRegistered, boolean autoRenew, Instant nextChargeAt,
                         String paymentStatus, String plan, PendingCharge pendingCharge) {}
    private int price(BillingPlan plan) { return plan == BillingPlan.PRO ? amount : plan.amount(); }
}
