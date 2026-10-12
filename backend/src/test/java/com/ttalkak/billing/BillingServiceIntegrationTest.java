package com.ttalkak.billing;

import com.ttalkak.auth.AuthService;
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
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "TOSS_TEST_CLIENT_KEY=test_ck_example",
        "TOSS_TEST_SECRET_KEY=test_sk_example",
        "BILLING_POLL_MS=3600000"
})
class BillingServiceIntegrationTest {
    @Autowired BillingService billing;
    @Autowired BillingChargeRepository charges;
    @Autowired BillingSubscriptionRepository subscriptions;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired UsagePeriodService periods;
    @Autowired MemberRepository members;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;
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
    void confirmedPaymentCreatesProPeriodOnceAndRenewsOnDueDate() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-09-27T07:00:00Z"));
        when(clock.instant()).thenAnswer(invocation -> now.get());
        Member member = newMember();
        Long memberId = member.getId();
        assertEquals("NOT_REGISTERED", billing.status(memberId).paymentStatus());
        var setup = billing.setup(memberId);
        assertEquals(4900, setup.amount());
        when(gateway.issueBillingKey("auth-once", setup.customerKey())).thenReturn("billing-key");
        when(gateway.charge(eq("billing-key"), eq(setup.customerKey()), anyString(), eq(4900)))
                .thenAnswer(invocation -> new BillingGateway.Payment("payment-" + invocation.getArgument(2),
                        invocation.getArgument(2), "DONE", "BILLING", 4900));

        billing.completeRegistration(memberId, setup.customerKey(), "auth-once");
        assertEquals("PRO", periods.at(memberId, now.get().plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        billing.completeRegistration(memberId, setup.customerKey(), "auth-once");
        assertEquals(1, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt());

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
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt()))
                .thenThrow(new BillingDeclinedException())
                .thenAnswer(invocation -> new BillingGateway.Payment("paid-after-retry",
                        invocation.getArgument(2), "DONE", "BILLING", 4900));

        ApiException failed = assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "auth-decline"));
        assertEquals("BILLING_PAYMENT_FAILED", failed.getCode());
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());
        assertFalse(billing.status(memberId).autoRenew());
        assertEquals("FAILED", billing.status(memberId).paymentStatus());
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt());
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
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                        "BILLING_UNCERTAIN", "응답 없음"));

        assertThrows(ApiException.class,
                () -> billing.completeRegistration(memberId, setup.customerKey(), "auth-timeout"));
        assertEquals("FREE", periods.at(memberId, now.plusSeconds(1)).plan());
        String orderId = charges.findFirstByMemberIdAndStatusOrderByIdDesc(memberId, "PENDING")
                .orElseThrow().getOrderId();
        when(gateway.lookup(orderId)).thenReturn(new BillingGateway.Payment(
                "payment-confirmed-later", orderId, "DONE", "BILLING", 4900));

        assertEquals("PENDING", billing.status(memberId).paymentStatus());
        assertNull(billing.status(memberId).nextChargeAt());
        billing.chargeDue();
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals("PRO", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt());
    }

    @Test
    void registeredCardWithoutFirstChargeIsRecoveredByPoll() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        transactions.executeWithoutResult(tx -> subscriptions.lockByMemberId(memberId)
                .orElseThrow().register("billing-before-crash"));
        when(gateway.charge(eq("billing-before-crash"), eq(setup.customerKey()), anyString(), eq(4900)))
                .thenAnswer(invocation -> new BillingGateway.Payment("recovered-first-payment",
                        invocation.getArgument(2), "DONE", "BILLING", 4900));
        assertEquals("PENDING", billing.status(memberId).paymentStatus());
        billing.chargeDue();
        assertEquals("ACTIVE", billing.status(memberId).paymentStatus());
        assertEquals("PRO", periods.at(memberId, now.plusSeconds(1)).plan());
        assertEquals(1, charges.countByMemberId(memberId));
        billing.chargeDue();
        verify(gateway, times(1)).charge(anyString(), anyString(), anyString(), anyInt());
    }

    @Test
    void lateDeclineCannotDisableRenewalForAnAlreadyConfirmedOrder() {
        Instant now = Instant.parse("2026-09-27T07:00:00Z");
        when(clock.instant()).thenReturn(now);
        Long memberId = newMember().getId();
        var setup = billing.setup(memberId);
        when(gateway.issueBillingKey(anyString(), anyString())).thenReturn("race-key");
        when(gateway.charge(anyString(), anyString(), anyString(), anyInt())).thenAnswer(invocation -> {
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
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt());
        verify(gateway, never()).lookup(anyString());
    }
}
