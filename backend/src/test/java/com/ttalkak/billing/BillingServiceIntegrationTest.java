package com.ttalkak.billing;

import com.ttalkak.auth.AuthService;
import com.ttalkak.auth.AccountWithdrawalService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.usage.UsagePeriodService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "BILLING_MODE=test",
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "TOSS_TEST_CLIENT_KEY=test_ck_example",
        "TOSS_TEST_SECRET_KEY=test_sk_example",
        "BILLING_POLL_MS=3600000"
})
class BillingServiceIntegrationTest {
    @Autowired BillingService billing;
    @Autowired AccountWithdrawalService withdrawal;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired BillingChargeRepository charges;
    @Autowired BillingSubscriptionRepository subscriptions;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired UsagePeriodService periods;
    @Autowired MemberRepository members;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;
    @Autowired javax.sql.DataSource dataSource;
    @MockitoBean BillingGateway gateway;
    @MockitoBean Clock clock;

    @org.junit.jupiter.api.BeforeEach
    void executeRequestBudgets() {
        doCallRealMethod().when(gateway).withinRequestBudget(any());
    }

    private Member newMember() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        return members.save(new Member("bill_" + suffix, "password", "bill_" + suffix,
                "결제 테스트", null, null, null));
    }

    @Test
    void providerConfigurationFailureKeepsSameOrderAndRenewalForRecovery() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-13T00:00:00Z"));
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("configuration-test-billing");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                        "BILLING_PROVIDER_CONFIGURATION", "Check configuration"));
        assertEquals("BILLING_PROVIDER_CONFIGURATION", assertThrows(ApiException.class, () ->
                billing.completeRegistration(memberId, setup.customerKey(), "configuration-test-auth")).getCode());
        var pending = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING").orElseThrow();
        assertTrue(billing.status(memberId).autoRenew());
        String originalOrderId = pending.getOrderId();

        when(gateway.lookup(originalOrderId)).thenReturn(null);
        doReturn(new BillingGateway.Payment("recovered-payment", originalOrderId,
                "DONE", "BILLING", 3900)).when(gateway)
                .charge(anyString(), anyString(), eq(originalOrderId), eq(3900), anyString());
        billing.retry(memberId);
        verify(gateway).lookup(originalOrderId);
        assertEquals(1, charges.countByMemberId(memberId));
        assertEquals("DONE", charges.findByOrderId(originalOrderId).orElseThrow().getStatus());
    }

    @Test
    void confirmedPaymentCreatesProPeriodOnceAndRenewsOnDueDate() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-09-27T07:00:00Z"));
        when(clock.instant()).thenAnswer(invocation -> now.get());
        Member member = newMember();
        Long memberId = member.getId();
        assertEquals("NOT_REGISTERED", billing.status(memberId).paymentStatus());
        var setup = billing.setup(memberId);
        assertEquals(9900, setup.amount());
        when(gateway.issueBillingKey("auth-once", setup.customerKey())).thenReturn("billing-key");
        when(gateway.charge(eq("billing-key"), eq(setup.customerKey()), anyString(), eq(9900), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("payment-" + invocation.getArgument(2),
                        invocation.getArgument(2), "DONE", "BILLING", 9900));

        billing.completeRegistration(memberId, setup.customerKey(), "auth-once");
        assertEquals("PRO", periods.at(memberId, now.get().plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        billing.completeRegistration(memberId, setup.customerKey(), "auth-once");
        assertEquals(1, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());

        Instant due = billing.status(memberId).nextChargeAt();
        now.set(due.plusSeconds(1));
        billing.chargeDue();
        assertEquals(2, charges.countByMemberId(memberId));
        assertEquals("PRO", periods.at(memberId, now.get()).plan());
        assertTrue(billing.status(memberId).nextChargeAt().isAfter(due));

        billing.cancelRenewal(memberId);
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        now.set(billing.status(memberId).nextChargeAt().plusSeconds(1));
        billing.chargeDue();
        assertEquals(2, charges.countByMemberId(memberId));
        assertEquals("FREE", periods.at(memberId, now.get()).plan());
        assertEquals("EXPIRED", billing.status(memberId).paymentStatus());
    }

    @Test
    void declinedChargeNeverGrantsProAndCanBeRetried() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("billing-declined");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenThrow(new BillingDeclinedException())
                .thenAnswer(invocation -> new BillingGateway.Payment("paid-after-retry",
                        invocation.getArgument(2), "DONE", "BILLING", 9900));

        ApiException failed = assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "auth-decline"));
        assertEquals("BILLING_PAYMENT_FAILED", failed.getCode());
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());
        assertFalse(billing.status(memberId).autoRenew());
        assertEquals("FAILED", billing.status(memberId).paymentStatus());
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        billing.retry(memberId);
        assertEquals("PRO", periods.at(memberId, now.plusSeconds(1)).plan());
        billing.cancelRenewal(memberId);
        Instant expiredAt = billing.status(memberId).nextChargeAt().plusSeconds(1);
        when(clock.instant()).thenReturn(expiredAt);
        assertEquals("EXPIRED", billing.status(memberId).paymentStatus());
    }

    @Test
    void unknownResultLooksUpTheSameOrderBeforeAnyNewCharge() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("billing-timeout");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                        "BILLING_UNCERTAIN", "응답 없음"));

        assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "auth-timeout"));
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());
        String orderId = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow().getOrderId();
        when(gateway.lookup(orderId)).thenReturn(new BillingGateway.Payment(
                "payment-confirmed-later", orderId, "DONE", "BILLING", 9900));

        assertEquals("PENDING", billing.status(memberId).paymentStatus());
        assertNull(billing.status(memberId).nextChargeAt());
        billing.chargeDue();
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals("PRO", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    void mismatchedRenewalProviderResponsesKeepSameOrderPendingUntilVerified() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("mock-renewal-key");

        // A DONE response belonging to a different order must never activate a paid period.
        when(gateway.charge(anyString(), anyString(), anyString(), eq(3900), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("unrelated-payment",
                        "foreign-order-id", "DONE", "BILLING", 3900));
        ApiException wrongOrder = assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "fixture-auth"));
        assertEquals("BILLING_UNCERTAIN", wrongOrder.getCode());

        BillingCharge pending = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow();
        String orderId = pending.getOrderId();
        assertEquals("RENEWAL", pending.getChargeKind());
        assertNull(pending.getPaymentKey());
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals("PENDING", billing.status(memberId).paymentStatus());
        assertEquals(1, charges.countByMemberId(memberId));

        // A matching order with the wrong amount is also not proof of a valid payment.
        when(gateway.lookup(orderId)).thenReturn(new BillingGateway.Payment(
                "wrong-amount-payment", orderId, "DONE", "BILLING", 3901));
        ApiException wrongAmount = assertThrows(ApiException.class, () -> billing.retry(memberId));
        assertEquals("BILLING_UNCERTAIN", wrongAmount.getCode());
        assertEquals("PENDING", charges.findByOrderId(orderId).orElseThrow().getStatus());
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());

        // A later matching lookup can settle the same durable order, without charging again.
        when(gateway.lookup(orderId)).thenReturn(new BillingGateway.Payment(
                "verified-renewal-payment", orderId, "DONE", "BILLING", 3900));
        billing.retry(memberId);
        assertEquals("DONE", charges.findByOrderId(orderId).orElseThrow().getStatus());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals(1, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), eq(3900), anyString());
        verify(gateway, times(2)).lookup(orderId);
    }

    @Test
    void registeredCardWithoutFirstChargeIsRecoveredByPoll() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        transactions.executeWithoutResult(tx -> subscriptions.lockByMemberId(memberId)
                .orElseThrow().register("billing-before-crash"));
        when(gateway.charge(eq("billing-before-crash"), eq(setup.customerKey()), anyString(), eq(9900), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("recovered-first-payment",
                        invocation.getArgument(2), "DONE", "BILLING", 9900));
        assertEquals("PENDING", billing.status(memberId).paymentStatus());
        billing.chargeDue();
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals("PRO", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    void lateDeclineCannotDisableRenewalForAnAlreadyConfirmedOrder() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("race-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString())).thenAnswer(invocation -> {
            String orderId = invocation.getArgument(2);
            // Simulate a competing worker committing approval before this response arrives.
            transactions.executeWithoutResult(tx -> {
                BillingSubscription subscription = subscriptions.lockByMemberId(memberId).orElseThrow();
                BillingCharge attempt = charges.findByOrderId(orderId).orElseThrow();
                attempt.complete("confirmed-by-other-worker");
                subscription.paidUntil(now.plusSeconds(3600));
            });
            throw new BillingDeclinedException();
        });
        assertDoesNotThrow(() -> billing.completeRegistration(memberId, setup.customerKey(), "race-auth"));
        assertTrue(billing.status(memberId).autoRenew());
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals("DONE", charges.findFirstByMemberIdOrderByIdDesc(memberId).orElseThrow().getStatus());
    }

    @Test
    void lightSubscriptionCanPayProratedUpgradeAndRenewAtStandardPrice() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-11T09:00:00Z"));
        when(clock.instant()).thenAnswer(invocation -> now.get());
        Long id = newMember().getId();
        var setup = billing.setup(id, "LIGHT");
        assertEquals("LIGHT", setup.plan());
        assertEquals(3900, setup.amount());
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("light-billing-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment(
                        "payment-" + invocation.getArgument(2),
                        invocation.getArgument(2), "DONE", "BILLING", ((Integer) invocation.getArgument(3)).longValue()));

        billing.completeRegistration(id, setup.customerKey(), "first-auth");
        assertEquals("LIGHT", periods.at(id, now.get().plusSeconds(1)).plan());
        verify(gateway).charge(anyString(), anyString(), anyString(), eq(3900), eq("TTALKAK LIGHT monthly"));
        Instant paidUntil = billing.status(id).nextChargeAt();
        now.set(Instant.ofEpochMilli((now.get().toEpochMilli() + paidUntil.toEpochMilli()) / 2));

        var quote = billing.upgradeQuote(id, "STANDARD");
        assertTrue(quote.amount() > 0 && quote.amount() < 2000);
        assertEquals(5900, quote.nextMonthlyAmount());
        assertTrue(quote.requestLimitAfterUpgrade() > 30);
        assertTrue(quote.requestLimitAfterUpgrade() <= 70);
        assertEquals("BILLING_UPGRADE_QUOTE_CHANGED", assertThrows(ApiException.class,
                () -> billing.upgrade(id, "STANDARD", quote.amount() + 1)).getCode());
        billing.upgrade(id, "STANDARD", quote.amount());
        assertEquals("STANDARD", periods.at(id, now.get().plusSeconds(1)).plan());
        assertEquals("STANDARD", billing.status(id).plan());
        assertEquals(paidUntil, billing.status(id).nextChargeAt());
        assertEquals(quote.requestLimitAfterUpgrade(),
                periods.at(id, now.get().plusSeconds(1)).requestLimitOverride().longValue());
        verify(gateway).charge(anyString(), anyString(), anyString(), eq(quote.amount()),
                eq("TTALKAK STANDARD upgrade"));

        now.set(paidUntil.plusSeconds(1));
        billing.chargeDue();
        assertEquals("STANDARD", periods.at(id, now.get().plusSeconds(1)).plan());
        assertNull(periods.at(id, now.get().plusSeconds(1)).requestLimitOverride());
        verify(gateway).charge(anyString(), anyString(), anyString(), eq(5900),
                eq("TTALKAK STANDARD monthly"));
    }

    @Test
    void reloadRecoversPendingUpgradeUsingOnlySavedOrderAndProviderLookup() throws Exception {
        Instant now = Instant.parse("2026-10-12T09:00:00Z");
        when(clock.instant()).thenReturn(now);
        Member member = newMember();
        Long id = member.getId();
        var setup = billing.setup(id, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("light-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("first-payment",
                        invocation.getArgument(2), "DONE", "BILLING", 3900));
        billing.completeRegistration(id, setup.customerKey(), "auth");
        var quote = billing.upgradeQuote(id, "STANDARD");

        org.mockito.Mockito.reset(gateway);
        doCallRealMethod().when(gateway).withinRequestBudget(any());
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                        "BILLING_UNCERTAIN", "network timeout"));
        assertEquals("BILLING_UNCERTAIN", assertThrows(ApiException.class,
                () -> billing.upgrade(id, "STANDARD", quote.amount())).getCode());

        var pending = billing.status(id);
        assertEquals("PENDING", pending.paymentStatus());
        assertEquals("UPGRADE", pending.pendingCharge().kind());
        assertEquals("STANDARD", pending.pendingCharge().plan());
        assertEquals(quote.amount(), pending.pendingCharge().amount());
        String orderId = charges.findFirstByMemberIdAndStatusOrderByIdDesc(id, "PENDING").orElseThrow().getOrderId();

        String token = auth.issueAccessToken(member);
        mvc.perform(get("/api/me/billing").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pendingCharge.kind").value("UPGRADE"))
                .andExpect(jsonPath("$.pendingCharge.plan").value("STANDARD"))
                .andExpect(jsonPath("$.pendingCharge.amount").value(quote.amount()));

        when(gateway.lookup(orderId)).thenReturn(null);
        assertEquals("PENDING", billing.reconcileUpgrade(id).paymentStatus());
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());

        when(gateway.lookup(orderId)).thenReturn(new BillingGateway.Payment(
                "recovered-payment", orderId, "DONE", "BILLING", quote.amount()));
        mvc.perform(post("/api/me/billing/reconcile-upgrade").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("STANDARD"))
                .andExpect(jsonPath("$.pendingCharge").isEmpty());
        assertEquals("STANDARD", periods.at(id, now.plusSeconds(1)).plan());
        assertEquals("ACTIVE", billing.reconcileUpgrade(id).paymentStatus());
        assertEquals(2, charges.countByMemberId(id));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    void mismatchedUpgradeProviderResponsesNeverGrantEntitlementOrTriggerSecondCharge() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("mock-light-billing-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("initial-payment",
                        invocation.getArgument(2), "DONE", "BILLING",
                        ((Integer) invocation.getArgument(3)).longValue()));
        billing.completeRegistration(memberId, setup.customerKey(), "fixture-auth");
        var quote = billing.upgradeQuote(memberId, "STANDARD");
        assertTrue(quote.amount() > 0);

        reset(gateway);
        doCallRealMethod().when(gateway).withinRequestBudget(any());

        // An unrelated provider order is not proof that our upgrade was paid.
        when(gateway.charge(anyString(), anyString(), anyString(),
                eq(quote.amount()), eq("TTALKAK STANDARD upgrade")))
                .thenAnswer(invocation -> new BillingGateway.Payment("unrelated-payment",
                        "other-order-id", "DONE", "BILLING",
                        ((Integer) invocation.getArgument(3)).longValue()));
        ApiException wrongOrder = assertThrows(ApiException.class,
                () -> billing.upgrade(memberId, "STANDARD", quote.amount()));
        assertEquals("BILLING_UNCERTAIN", wrongOrder.getCode());

        BillingCharge pending = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow();
        String originalOrderId = pending.getOrderId();
        assertEquals("UPGRADE", pending.getChargeKind());
        assertNull(pending.getPaymentKey());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals("LIGHT", subscriptions.findByMemberId(memberId).orElseThrow().getPlan().name());

        // A later lookup for the same order with a mismatched amount is likewise
        // uncertain. Reconciliation may only look up; it must never charge again.
        when(gateway.lookup(originalOrderId)).thenReturn(new BillingGateway.Payment(
                "wrong-amount-payment", originalOrderId, "DONE", "BILLING", quote.amount() + 1L));
        ApiException wrongAmount = assertThrows(ApiException.class,
                () -> billing.reconcileUpgrade(memberId));
        assertEquals("BILLING_UNCERTAIN", wrongAmount.getCode());

        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals("LIGHT", subscriptions.findByMemberId(memberId).orElseThrow().getPlan().name());
        assertEquals("PENDING", charges.findByOrderId(originalOrderId).orElseThrow().getStatus());
        assertEquals(2, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(),
                eq(quote.amount()), eq("TTALKAK STANDARD upgrade"));
        verify(gateway, times(1)).lookup(originalOrderId);
    }

    @Test
    void withdrawnMemberCannotStartNewUpgradeOrderOrProviderCharge() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("upgrade_withdraw_" + suffix,
                passwordEncoder.encode(password), "upgrade_withdraw_" + suffix,
                "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("mock-light-billing-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("payment-" + invocation.getArgument(2),
                        invocation.getArgument(2), "DONE", "BILLING",
                        ((Integer) invocation.getArgument(3)).longValue()));

        billing.completeRegistration(memberId, setup.customerKey(), "fixture-auth");
        var quote = billing.upgradeQuote(memberId, "STANDARD");
        assertTrue(quote.amount() > 0);
        withdrawal.withdraw(member, password, null);
        clearInvocations(gateway);

        ApiException inactive = assertThrows(ApiException.class,
                () -> billing.upgrade(memberId, "STANDARD", quote.amount()));
        assertEquals("BILLING_ACCOUNT_INACTIVE", inactive.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals("LIGHT", subscriptions.findByMemberId(memberId).orElseThrow().getPlan().name());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId), "withdrawal must not create a new upgrade order");
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void withdrawnMemberCannotRetryUncertainUpgradeAfterAccountClosure() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("pending_upgrade_" + suffix,
                passwordEncoder.encode(password), "pending_upgrade_" + suffix,
                "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("mock-light-billing-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("payment-" + invocation.getArgument(2),
                        invocation.getArgument(2), "DONE", "BILLING",
                        ((Integer) invocation.getArgument(3)).longValue()));
        billing.completeRegistration(memberId, setup.customerKey(), "fixture-auth");
        var quote = billing.upgradeQuote(memberId, "STANDARD");

        // The initial upgrade reached the fake provider but its answer was lost.
        // The durable PENDING order must not authorize another provider call after withdrawal.
        doThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                "BILLING_UNCERTAIN", "synthetic upgrade timeout"))
                .when(gateway).charge(anyString(), anyString(), anyString(),
                        eq(quote.amount()), eq("TTALKAK STANDARD upgrade"));
        assertEquals("BILLING_UNCERTAIN", assertThrows(ApiException.class,
                () -> billing.upgrade(memberId, "STANDARD", quote.amount())).getCode());
        BillingCharge pendingOrder = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow();
        assertEquals("UPGRADE", pendingOrder.getChargeKind());
        String originalOrderId = pendingOrder.getOrderId();
        assertEquals(2, charges.countByMemberId(memberId));

        withdrawal.withdraw(member, password, null);
        clearInvocations(gateway);

        ApiException inactive = assertThrows(ApiException.class,
                () -> billing.upgrade(memberId, "STANDARD", quote.amount()));
        assertEquals("BILLING_ACCOUNT_INACTIVE", inactive.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals("LIGHT", subscriptions.findByMemberId(memberId).orElseThrow().getPlan().name());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(2, charges.countByMemberId(memberId));
        assertEquals(originalOrderId, charges.findFirstByMemberIdAndStatusOrderByIdDesc(
                memberId, "PENDING").orElseThrow().getOrderId());
        verify(gateway, never()).lookup(anyString());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    void lateUpgradeApprovalAfterWithdrawalRequiresReconciliationWithoutChangingEntitlement() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("late_upgrade_" + suffix,
                passwordEncoder.encode(password), "late_upgrade_" + suffix,
                "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        var setup = billing.setup(memberId, "LIGHT");
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("mock-light-billing-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> new BillingGateway.Payment("initial-payment",
                        invocation.getArgument(2), "DONE", "BILLING",
                        ((Integer) invocation.getArgument(3)).longValue()));
        billing.completeRegistration(memberId, setup.customerKey(), "fixture-auth");
        var quote = billing.upgradeQuote(memberId, "STANDARD");
        clearInvocations(gateway);

        // The upgrade order is prepared first. While the fake provider processes
        // the charge, withdrawal commits before the approval response arrives.
        doAnswer(invocation -> {
            withdrawal.withdraw(member, password, null);
            return new BillingGateway.Payment("late-upgrade-payment",
                    invocation.getArgument(2), "DONE", "BILLING",
                    ((Integer) invocation.getArgument(3)).longValue());
        }).when(gateway).charge(anyString(), anyString(), anyString(),
                eq(quote.amount()), eq("TTALKAK STANDARD upgrade"));

        ApiException reconciliation = assertThrows(ApiException.class,
                () -> billing.upgrade(memberId, "STANDARD", quote.amount()));
        assertEquals("BILLING_UPGRADE_RECONCILIATION_REQUIRED", reconciliation.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals("LIGHT", subscriptions.findByMemberId(memberId).orElseThrow().getPlan().name());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(2, charges.countByMemberId(memberId));
        BillingCharge pendingOrder = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow();
        assertEquals("UPGRADE", pendingOrder.getChargeKind());
        assertNull(pendingOrder.getPaymentKey(), "unreconciled approval must not look locally settled");
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(),
                eq(quote.amount()), eq("TTALKAK STANDARD upgrade"));

        // Even a later provider lookup must not turn a withdrawn account paid.
        when(gateway.lookup(pendingOrder.getOrderId())).thenReturn(new BillingGateway.Payment(
                "late-upgrade-payment", pendingOrder.getOrderId(), "DONE", "BILLING", quote.amount()));
        ApiException retry = assertThrows(ApiException.class, () -> billing.reconcileUpgrade(memberId));
        assertEquals("BILLING_UPGRADE_RECONCILIATION_REQUIRED", retry.getCode());
        assertEquals("LIGHT", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals("PENDING", charges.findByOrderId(pendingOrder.getOrderId()).orElseThrow().getStatus());
        assertEquals(2, charges.countByMemberId(memberId));
        verify(gateway, times(1)).lookup(pendingOrder.getOrderId());
    }

    @Test
    void withdrawnMemberCannotBeChargedBySchedulerOrStaleCandidate() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        Member member = newMember();
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        transactions.executeWithoutResult(tx -> subscriptions.lockByMemberId(memberId)
                .orElseThrow().register("fixture-no-provider-key"));

        // Simulate legacy subscription data that was never automatically disabled
        // before the withdrawal fix: the scheduler must still exclude the account.
        member.withdraw();
        members.saveAndFlush(member);
        assertTrue(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertFalse(subscriptions.dueMemberIds(now, "test:legacy").contains(memberId));

        billing.chargeDue();
        // Even a pre-withdrawal scheduled candidate cannot start a new charge.
        billing.charge(memberId);
        assertEquals(0, charges.countByMemberId(memberId));
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void retryWithoutSubscriptionStillRequiresCardSetup() {
        Long memberId = newMember().getId();
        ApiException missing = assertThrows(ApiException.class, () -> billing.retry(memberId));
        assertEquals("BILLING_SETUP_REQUIRED", missing.getCode());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void lateBillingKeyIssuanceCannotReactivateWithdrawnSubscription() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("late_reg_" + suffix, passwordEncoder.encode(password),
                "late_reg_" + suffix, "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        var setup = billing.setup(memberId, "LIGHT");

        when(gateway.issueBillingKey(eq("late-registration-auth"), eq(setup.customerKey())))
                .thenAnswer(invocation -> {
                    // Registration went to the fake provider first; withdrawal
                    // commits before the provider returns its newly issued key.
                    withdrawal.withdraw(member, password, null);
                    return "mock-key-issued-after-withdrawal";
                });

        ApiException inactive = assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "late-registration-auth"));
        assertEquals("BILLING_ACCOUNT_INACTIVE", inactive.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        BillingSubscription subscription = subscriptions.findByMemberId(memberId).orElseThrow();
        assertFalse(subscription.isAutoRenew(), "late provider response must not restart renewal");
        assertNull(subscription.getBillingKey(), "issued key must not be persisted for withdrawn account");
        assertEquals(0, charges.countByMemberId(memberId));
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void retryAfterWithdrawalCannotReactivateAutoRenewal() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("late_retry_" + suffix, passwordEncoder.encode(password),
                "late_retry_" + suffix, "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        transactions.executeWithoutResult(tx ->
                subscriptions.lockByMemberId(memberId).orElseThrow().register("mock-test-key"));
        withdrawal.withdraw(member, password, null);

        ApiException inactive = assertThrows(ApiException.class, () -> billing.retry(memberId));
        assertEquals("BILLING_ACCOUNT_INACTIVE", inactive.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals(0, charges.countByMemberId(memberId));
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void withdrawalDuringInflightProviderApprovalNeverRestartsAutoRenewal() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("race_" + suffix, passwordEncoder.encode(password),
                "race_" + suffix, "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        transactions.executeWithoutResult(tx ->
                subscriptions.lockByMemberId(memberId).orElseThrow().register("mock-only-billing-key"));

        when(gateway.charge(anyString(), anyString(), anyString(), eq(3900), anyString()))
                .thenAnswer(invocation -> {
                    String orderId = invocation.getArgument(2);
                    // The preparation transaction already committed. Exercise the real
                    // withdrawal path while the fake provider call is in flight.
                    withdrawal.withdraw(member, password, null);
                    return new BillingGateway.Payment("mock-paid-" + orderId,
                            orderId, "DONE", "BILLING", 3900);
                });

        billing.charge(memberId);

        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew(),
                "a delayed provider approval must not restart renewal after withdrawal");
        assertEquals(1, charges.countByMemberId(memberId));
        assertEquals("DONE", charges.findFirstByMemberIdOrderByIdDesc(memberId)
                .orElseThrow().getStatus(),
                "a provider-approved in-flight order still needs a durable reconciliation record");
        assertFalse(subscriptions.dueMemberIds(now, "test:legacy").contains(memberId));

        billing.charge(memberId);
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void withdrawalDuringInflightProviderDeclineLeavesFailedOrderWithoutRenewal() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("decline_" + suffix, passwordEncoder.encode(password),
                "decline_" + suffix, "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        transactions.executeWithoutResult(tx ->
                subscriptions.lockByMemberId(memberId).orElseThrow().register("mock-only-billing-key"));

        when(gateway.charge(anyString(), anyString(), anyString(), eq(3900), anyString()))
                .thenAnswer(invocation -> {
                    // Provider call began before withdrawal. A late definitive decline
                    // must not reactivate the withdrawn subscriber or spawn a retry.
                    withdrawal.withdraw(member, password, null);
                    throw new BillingDeclinedException();
                });

        ApiException failure = assertThrows(ApiException.class, () -> billing.charge(memberId));
        assertEquals("BILLING_PAYMENT_FAILED", failure.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals(1, charges.countByMemberId(memberId));
        assertEquals("FAILED", charges.findFirstByMemberIdOrderByIdDesc(memberId).orElseThrow().getStatus());

        billing.charge(memberId);
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void withdrawalDuringUncertainProviderResultPreservesPendingOrderWithoutRetry() {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("uncertain_" + suffix, passwordEncoder.encode(password),
                "uncertain_" + suffix, "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        transactions.executeWithoutResult(tx ->
                subscriptions.lockByMemberId(memberId).orElseThrow().register("mock-only-billing-key"));

        when(gateway.charge(anyString(), anyString(), anyString(), eq(3900), anyString()))
                .thenAnswer(invocation -> {
                    // The provider may have received the payment, but its response
                    // is lost after the real withdrawal path has committed.
                    withdrawal.withdraw(member, password, null);
                    throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                            "BILLING_UNCERTAIN", "synthetic provider timeout");
                });

        ApiException uncertain = assertThrows(ApiException.class, () -> billing.charge(memberId));
        assertEquals("BILLING_UNCERTAIN", uncertain.getCode());
        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertFalse(subscriptions.findByMemberId(memberId).orElseThrow().isAutoRenew());
        assertEquals(1, charges.countByMemberId(memberId));
        BillingCharge pending = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow();
        String originalOrderId = pending.getOrderId();
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());

        // No new charge and no automated provider lookup after withdrawal:
        // the retained order must be reconciled separately using its ID.
        billing.charge(memberId);
        billing.chargeDue();
        assertEquals(1, charges.countByMemberId(memberId));
        assertEquals(originalOrderId, charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow().getOrderId());
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }

    @Test
    void selectedStandardSetupRejectsUnknownPlanWithoutCharging() {
        Long id = newMember().getId();
        var setup = billing.setup(id, "STANDARD");
        assertEquals("STANDARD", setup.plan());
        assertEquals(5900, setup.amount());
        assertEquals("BILLING_PLAN_INVALID", assertThrows(ApiException.class,
                () -> billing.setup(id, "ENTERPRISE")).getCode());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    @Test
    void withdrawnMemberCannotReusePreviouslyValidAccessTokenForBillingEndpoints() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String password = "Withdrawal-Fixture-123!";
        Member member = members.saveAndFlush(new Member("token_withdraw_" + suffix,
                passwordEncoder.encode(password), "token_withdraw_" + suffix,
                "Synthetic Member", null, null, null));
        Long memberId = member.getId();
        billing.setup(memberId, "LIGHT");
        String token = auth.issueAccessToken(member);

        // This was a valid token before withdrawal; no login failure is being simulated.
        mvc.perform(get("/api/me/billing").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        withdrawal.withdraw(member, password, null);

        // Endpoints must recheck the current account state, not trust a previously
        // issued JWT. Keep financial records but deny their former owner access.
        mvc.perform(get("/api/me/billing").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/me/billing/setup").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/me/billing/retry").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());

        assertFalse(members.findById(memberId).orElseThrow().isActive());
        assertEquals(0, charges.countByMemberId(memberId));
        verify(gateway, never()).issueBillingKey(anyString(), anyString());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
    }

    /**
     * A disposable MySQL billing run must fail if Spring's test profile silently
     * selects the H2 datasource. The normal H2 test suite does not claim MySQL coverage.
     */
    @Test
    void isolatedBillingRegressionMustActuallyConnectToMysqlWhenRequested() throws Exception {
        if (!"1".equals(System.getenv("TTALKAK_REQUIRE_MYSQL_BILLING_REGRESSION"))) {
            return;
        }
        try (var connection = dataSource.getConnection()) {
            assertEquals("MySQL", connection.getMetaData().getDatabaseProductName(),
                    "The isolated billing regression must use MySQL, not application-test.yml H2");
        }
    }

    @Test
    void onlySignedInMemberCanRegisterAndForeignCustomerKeyIsRejected() throws Exception {
        mvc.perform(post("/api/me/billing/setup")).andExpect(status().isUnauthorized());
        Member member = newMember();
        String token = auth.issueAccessToken(member);
        mvc.perform(post("/api/me/billing/setup").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientKey").value("test_ck_example"));
        assertThrows(ApiException.class,
                () -> billing.completeRegistration(member.getId(), "different-user", "auth-key"));
        verify(gateway, never()).issueBillingKey(anyString(), anyString());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
    }
}
