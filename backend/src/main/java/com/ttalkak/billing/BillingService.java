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
            @Value("${ttalkak.billing.monthly-price-krw:4900}") int amount, Clock clock) {
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
                if (active || pending) {
                    throw new ApiException(HttpStatus.CONFLICT, "BILLING_PLAN_CHANGE_REQUIRES_UPGRADE",
                            "진행 중인 결제 또는 구독은 업그레이드 절차를 이용해 주세요.");
                }
                locked.selectPlan(selected);
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
            BillingCharge pending = previous.orElseGet(() -> {
                        Instant start = now;
                        Instant end = start.atZone(SEOUL).plusMonths(1).toInstant();
                        return charges.saveAndFlush(new BillingCharge(memberId, start, end));
                    });
            return new Prepared(subscription.getBillingKey(), subscription.getCustomerKey(),
                    pending.getOrderId(), previous.isPresent());
        });
        if (prepared == null) return;

        BillingGateway.Payment payment;
        try {
            payment = prepared.retry() ? gateway.lookup(prepared.orderId()) : null;
            if (payment == null) {
                payment = gateway.charge(prepared.billingKey(), prepared.customerKey(), prepared.orderId(), amount);
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
                || !prepared.orderId().equals(payment.orderId()) || payment.totalAmount() != amount
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
                    attempt.getPeriodStart(), attempt.getPeriodEnd()));
            attempt.complete(confirmedPayment.paymentKey());
            subscription.paidUntil(attempt.getPeriodEnd());
        });
    }

    private record Prepared(String billingKey, String customerKey, String orderId,
                            boolean retry, BillingPlan plan, int amount) {}
    public record Setup(String clientKey, String customerKey, int amount, boolean cardRegistered, String plan) {}
    public record Status(boolean cardRegistered, boolean autoRenew, Instant nextChargeAt,
                         String paymentStatus, String plan) {}
    private int price(BillingPlan plan) { return plan == BillingPlan.PRO ? amount : plan.amount(); }
}
