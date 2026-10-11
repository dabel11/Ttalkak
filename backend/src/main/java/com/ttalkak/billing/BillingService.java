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

    public BillingService(BillingSubscriptionRepository subscriptions, BillingChargeRepository charges,
            PaidUsagePeriodRepository periods, BillingGateway gateway, TransactionTemplate transactions,
            @Value("${ttalkak.billing.toss-client-key:}") String clientKey,
            @Value("${ttalkak.billing.toss-secret-key:}") String secretKey,
            @Value("${ttalkak.billing.monthly-price-krw:9900}") int amount, Clock clock) {
        this.subscriptions = subscriptions;
        this.charges = charges;
        this.periods = periods;
        this.gateway = gateway;
        this.transactions = transactions;
        this.clientKey = clientKey;
        this.secretKey = secretKey;
        this.amount = amount;
        this.clock = clock;
    }

    private void configured() {
        if (!clientKey.startsWith("test_ck_") || !secretKey.startsWith("test_sk_") || amount <= 0) {
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
                    .orElseGet(() -> subscriptions.saveAndFlush(new BillingSubscription(memberId)));
            BillingSubscription locked = subscriptions.lockByMemberId(memberId).orElseThrow();
            if (selected != null && locked.getPlan() != selected) {
                boolean active = locked.getNextChargeAt() != null
                        && locked.getNextChargeAt().isAfter(clock.instant());
                boolean pending = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING").isPresent();
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
        return subscriptions.findByMemberId(memberId)
                .map(s -> new Status(s.getBillingKey() != null, s.isAutoRenew(), s.getNextChargeAt(), paymentStatus(s), s.getPlan().name()))
                .orElseGet(() -> new Status(false, false, null, "NOT_REGISTERED", "FREE"));
    }

    private String paymentStatus(BillingSubscription subscription) {
        Long memberId = subscription.getMemberId();
        if (charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING").isPresent()) {
            return "PENDING";
        }
        if (subscription.getNextChargeAt() != null && subscription.getNextChargeAt().isAfter(clock.instant())) {
            return "ACTIVE";
        }
        if (subscription.getBillingKey() == null) return "NOT_REGISTERED";
        if (charges.findFirstByMemberIdOrderByIdDesc(memberId)
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
        if (!subscription.getCustomerKey().equals(customerKey) || authKey == null || authKey.isBlank()
                || authKey.length() > 300) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BILLING_AUTH_INVALID", "카드 인증 정보를 확인해 주세요.");
        }
        if (subscription.getBillingKey() == null) {
            String billingKey = gateway.issueBillingKey(authKey, customerKey);
            transactions.executeWithoutResult(tx -> {
                BillingSubscription locked = subscriptions.lockByMemberId(memberId).orElseThrow();
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
        transactions.executeWithoutResult(tx -> subscriptions.lockByMemberId(memberId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED", "등록된 카드가 없습니다."))
                .resume());
        charge(memberId);
        return status(memberId);
    }

    public Status cancelRenewal(Long memberId) {
        transactions.executeWithoutResult(tx -> subscriptions.lockByMemberId(memberId)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "BILLING_SETUP_REQUIRED", "등록된 구독이 없습니다."))
                .cancelRenewal());
        return status(memberId);
    }

    @Scheduled(fixedDelayString = "${ttalkak.billing.poll-ms:60000}",
            initialDelayString = "${ttalkak.billing.poll-ms:60000}")
    public void chargeDue() {
        if (!clientKey.startsWith("test_ck_") || !secretKey.startsWith("test_sk_")) return;
        for (Long memberId : subscriptions.dueMemberIds(clock.instant())) {
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
            if (!subscription.isAutoRenew() || subscription.getBillingKey() == null) return null;
            Instant now = clock.instant();
            if (subscription.getNextChargeAt() != null && subscription.getNextChargeAt().isAfter(now)) return null;
            var previous = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING");
            if (previous.isPresent() && "UPGRADE".equals(previous.get().getChargeKind())) return null;
            BillingCharge pending = previous.orElseGet(() -> {
                        Instant start = now;
                        Instant end = start.atZone(SEOUL).plusMonths(1).toInstant();
                        BillingPlan plan = subscription.getPlan();
                        return charges.saveAndFlush(new BillingCharge(memberId, start, end,
                                plan, price(plan), "RENEWAL"));
                    });
            return new Prepared(subscription.getBillingKey(), subscription.getCustomerKey(),
                    pending.getOrderId(), previous.isPresent(), pending.getPlan(), pending.getAmount());
        });
        if (prepared == null) return;

        BillingGateway.Payment payment;
        try {
            payment = prepared.retry() ? gateway.lookup(prepared.orderId()) : null;
            if (payment == null) {
                payment = gateway.charge(prepared.billingKey(), prepared.customerKey(), prepared.orderId(), prepared.amount());
            }
        } catch (BillingDeclinedException e) {
            boolean declined = Boolean.TRUE.equals(transactions.execute(tx -> {
                BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
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
            BillingCharge attempt = charges.findByOrderId(prepared.orderId()).orElseThrow();
            if (attempt.getStatus().equals("DONE")) return;
            if (!attempt.getStatus().equals("PENDING")) throw new IllegalStateException("Charge is not pending");
            periods.saveAndFlush(new PaidUsagePeriod(memberId, confirmedPayment.paymentKey(),
                    attempt.getPeriodStart(), attempt.getPeriodEnd(), attempt.getPlan().name()));
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
        return quoteAt(memberId, BillingPlan.parse(planCode), clock.instant());
    }

    private UpgradeQuote quoteAt(Long memberId, BillingPlan target, Instant now) {
        var active = periods.findFirstByMemberIdAndStartsAtLessThanEqualAndEndsAtGreaterThanAndRevokedAtIsNullOrderByStartsAtDesc(
                memberId, now, now).orElseThrow(() -> new ApiException(
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
            if (subscription.getBillingKey() == null) {
                throw new ApiException(HttpStatus.CONFLICT, "BILLING_CARD_REQUIRED",
                        "카드를 먼저 등록해 주세요.");
            }
            var previous = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING");
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
                retry = false;
            }
            return new PreparedUpgrade(subscription.getBillingKey(), subscription.getCustomerKey(),
                    pending.getOrderId(), pending.getAmount(), retry);
        });
        BillingGateway.Payment payment = prepared.retry()
                ? gateway.lookup(prepared.orderId()) : null;
        if (payment == null) {
            payment = gateway.charge(prepared.billingKey(), prepared.customerKey(),
                    prepared.orderId(), prepared.amount());
        }
        if (payment == null || !"DONE".equals(payment.status()) || !"BILLING".equals(payment.type())
                || !prepared.orderId().equals(payment.orderId())
                || payment.totalAmount() != prepared.amount()
                || payment.paymentKey() == null || payment.paymentKey().isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UNCERTAIN",
                    "결제 결과를 확인할 수 없습니다. 같은 주문으로 재확인해 주세요.");
        }
        BillingGateway.Payment confirmed = payment;
        transactions.executeWithoutResult(tx -> {
            BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
            BillingCharge charge = charges.findByOrderId(prepared.orderId()).orElseThrow();
            if ("DONE".equals(charge.getStatus())) return;
            Instant now = clock.instant();
            var active = periods.findFirstByMemberIdAndStartsAtLessThanEqualAndEndsAtGreaterThanAndRevokedAtIsNullOrderByStartsAtDesc(
                    memberId, now, now).orElseThrow(() -> new ApiException(
                            HttpStatus.BAD_GATEWAY, "BILLING_UPGRADE_RECONCILIATION_REQUIRED",
                            "결제는 확인됐으나 이용 기간이 만료됐습니다. 관리자 확인이 필요합니다."));
            if (!active.getEndsAt().equals(charge.getPeriodEnd())) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_UPGRADE_RECONCILIATION_REQUIRED",
                        "이용 기간이 변경돼 결제 대사가 필요합니다.");
            }
            active.upgradeTo(charge.getPlan().name(), charge.getUpgradeRequestLimit());
            subscription.selectPlan(charge.getPlan());
            charge.complete(confirmed.paymentKey());
        });
        return status(memberId);
    }

    private record PreparedUpgrade(String billingKey, String customerKey, String orderId,
                                   int amount, boolean retry) {}
    public record UpgradeQuote(String fromPlan, String targetPlan, int amount, int nextMonthlyAmount,
                               long requestLimitAfterUpgrade, Instant periodEnd) {}

    private record Prepared(String billingKey, String customerKey, String orderId,
                            boolean retry, BillingPlan plan, int amount) {}
    public record Setup(String clientKey, String customerKey, int amount, boolean cardRegistered, String plan) {}
    public record Status(boolean cardRegistered, boolean autoRenew, Instant nextChargeAt,
                         String paymentStatus, String plan) {}
    private int price(BillingPlan plan) { return plan == BillingPlan.PRO ? amount : plan.amount(); }
}
