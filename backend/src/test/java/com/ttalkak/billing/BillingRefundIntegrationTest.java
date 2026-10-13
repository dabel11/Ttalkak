package com.ttalkak.billing;

import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.usage.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "BILLING_MODE=test",
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "spring.datasource.url=jdbc:h2:mem:ttalkak-refund-test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "TOSS_TEST_CLIENT_KEY=test_ck_example", "TOSS_TEST_SECRET_KEY=test_sk_example", "BILLING_POLL_MS=3600000"
})
class BillingRefundIntegrationTest {
    @Autowired BillingRefundService refunds;
    @Autowired BillingService billing;
    @Autowired BillingChargeRepository charges;
    @Autowired BillingSubscriptionRepository subscriptions;
    @Autowired PaidUsagePeriodRepository paid;
    @Autowired UsagePeriodService periods;
    @Autowired MemberRequestGuard guard;
    @Autowired MemberTokenUsageService usage;
    @Autowired MemberRequestLeaseRepository leases;
    @Autowired MemberRepository members;
    @Autowired AdminAuditLogRepository audits;
    @Autowired TransactionTemplate transactions;
    @Autowired AuthService auth;
    @Autowired MockMvc mvc;
    @MockitoBean BillingGateway gateway;
    @MockitoBean Clock clock;
    private final Instant now = Instant.parse("2026-10-13T00:00:00Z");

    @BeforeEach void budget() {
        when(clock.instant()).thenReturn(now);
        doCallRealMethod().when(gateway).withinRequestBudget(any());
    }
    private Member member(boolean admin) {
        String key = UUID.randomUUID().toString();
        return members.saveAndFlush(admin ? Member.createAdmin(key, "password", key, "Admin")
                : new Member(key, "password", key, "Member", null, null, null));
    }
    private BillingCharge paidOrder(Member owner, String scope) {
        Instant end = now.plusSeconds(86400 * 30);
        BillingSubscription subscription = new BillingSubscription(owner.getId(), scope);
        subscription.selectPlan(BillingPlan.LIGHT);
        subscription.register("private-billing-key");
        subscription.paidUntil(end);
        subscriptions.saveAndFlush(subscription);
        BillingCharge charge = new BillingCharge(owner.getId(), now.minusSeconds(60), end,
                BillingPlan.LIGHT, 3900, "RENEWAL", scope);
        charge.complete("private-payment-" + UUID.randomUUID());
        charges.saveAndFlush(charge);
        paid.saveAndFlush(new PaidUsagePeriod(owner.getId(), charge.getPaymentKey(),
                charge.getPeriodStart(), end, "LIGHT", scope));
        return charge;
    }
    private BillingGateway.Payment done(BillingCharge charge) {
        return new BillingGateway.Payment(charge.getPaymentKey(), charge.getOrderId(), "DONE", "BILLING", 3900, 3900L);
    }
    private BillingGateway.Payment canceled(BillingCharge charge) {
        return new BillingGateway.Payment(charge.getPaymentKey(), charge.getOrderId(), "CANCELED", "BILLING", 3900, 0L);
    }

    @Test void reviewDoesNotCancelButConfirmedRefundRevokesOnceAndPreservesUsage() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        usage.record(owner.getId(), "paid-request", new TokenCounts(10, 5, 15), now.minusSeconds(1));
        assertEquals("REQUESTED", refunds.request(owner.getId(), charge.getOrderId(), "검토 요청").refundState());
        assertEquals("LIGHT", periods.at(owner.getId(), now).plan());
        assertFalse(billing.status(owner.getId()).autoRenew());
        assertEquals("BILLING_REFUND_REVIEW_PENDING", assertThrows(ApiException.class,
                () -> billing.retry(owner.getId())).getCode());
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        verify(gateway, never()).lookup(anyString());
        verify(gateway, never()).cancel(anyString(), anyString(), anyInt());
        when(gateway.lookup(charge.getOrderId())).thenReturn(done(charge));
        when(gateway.cancel(eq(charge.getPaymentKey()), anyString(), eq(3900))).thenReturn(canceled(charge));
        assertEquals("DONE", refunds.approve(charge.getOrderId(), 3900, true, "원 결제 검토 완료", admin).refundState());
        assertEquals("FREE", periods.at(owner.getId(), now).plan());
        assertEquals(15, periods.at(owner.getId(), now).totalTokens());
        assertEquals("REFUNDED", billing.status(owner.getId()).paymentStatus());
        assertEquals("DONE", refunds.approve(charge.getOrderId(), 3900, true, "동일 요청", admin).refundState());
        verify(gateway, times(1)).cancel(eq(charge.getPaymentKey()), anyString(), eq(3900));
        assertEquals(1, audits.findAll().stream().filter(a -> a.getTargetId().equals(owner.getId())
                && "BILLING_REFUND_DONE".equals(a.getAction())).count());
    }

    @Test void uncertainCancellationBlocksNewRequestsAndLookupCompletesWithoutAnotherCancel() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        refunds.request(owner.getId(), charge.getOrderId(), "검토 요청");
        when(gateway.lookup(charge.getOrderId())).thenReturn(done(charge));
        when(gateway.cancel(anyString(), anyString(), anyInt())).thenThrow(
                new ApiException(HttpStatus.GATEWAY_TIMEOUT, "BILLING_REFUND_UNCERTAIN", "timeout"));
        assertThrows(ApiException.class, () -> refunds.approve(charge.getOrderId(), 3900, true, "검토 완료", admin));
        assertEquals("PENDING", charges.findByOrderId(charge.getOrderId()).orElseThrow().getRefundState());
        assertEquals("LIGHT", periods.at(owner.getId(), now).plan());
        assertEquals("BILLING_REFUND_PENDING", assertThrows(ApiException.class, () -> guard.acquire(owner.getId())).getCode());
        when(gateway.lookup(charge.getOrderId())).thenReturn(canceled(charge));
        assertEquals("DONE", refunds.reconcile(charge.getOrderId(), admin).refundState());
        verify(gateway, times(1)).cancel(anyString(), anyString(), anyInt());
        var permit = guard.acquire(owner.getId());
        guard.release(permit);
    }

    @Test void retryReusesPersistedCancellationKey() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        refunds.request(owner.getId(), charge.getOrderId(), "검토 요청");
        String key = charges.findByOrderId(charge.getOrderId()).orElseThrow().getRefundIdempotencyKey();
        when(gateway.lookup(charge.getOrderId())).thenReturn(done(charge));
        when(gateway.cancel(charge.getPaymentKey(), key, 3900))
                .thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "BILLING_REFUND_UNCERTAIN", "network"))
                .thenReturn(canceled(charge));
        assertThrows(ApiException.class, () -> refunds.approve(charge.getOrderId(), 3900, true, "검토 완료", admin));
        assertEquals("DONE", refunds.approve(charge.getOrderId(), 3900, true, "재확인", admin).refundState());
        verify(gateway, times(2)).cancel(charge.getPaymentKey(), key, 3900);
    }

    @Test void mismatchedProviderIdentityAndPartialBalanceNeverRemoveAccessOrCancelAgain() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        refunds.request(owner.getId(), charge.getOrderId(), "검토 요청");
        when(gateway.lookup(charge.getOrderId())).thenReturn(new BillingGateway.Payment("foreign-payment",
                charge.getOrderId(), "CANCELED", "BILLING", 3900, 0L));
        assertThrows(ApiException.class, () -> refunds.approve(charge.getOrderId(), 3900, true, "검토 완료", admin));
        assertEquals("LIGHT", periods.at(owner.getId(), now).plan());
        when(gateway.lookup(charge.getOrderId())).thenReturn(new BillingGateway.Payment(charge.getPaymentKey(),
                charge.getOrderId(), "PARTIAL_CANCELED", "BILLING", 3900, 1000L));
        assertEquals("BILLING_REFUND_MANUAL_REVIEW", assertThrows(ApiException.class,
                () -> refunds.approve(charge.getOrderId(), 3900, true, "재검토", admin)).getCode());
        verify(gateway, never()).cancel(anyString(), anyString(), anyInt());
    }

    @Test void activeAiRequestAndStaleReviewPreventProviderCancellation() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        refunds.request(owner.getId(), charge.getOrderId(), "검토 요청");
        assertThrows(ApiException.class, () -> refunds.approve(charge.getOrderId(), 3901, true, "검토 완료", admin));
        var permit = guard.acquire(owner.getId());
        assertEquals("MEMBER_REQUEST_IN_PROGRESS", assertThrows(ApiException.class,
                () -> refunds.approve(charge.getOrderId(), 3900, true, "검토 완료", admin)).getCode());
        guard.release(permit);
        assertEquals("REQUESTED", charges.findByOrderId(charge.getOrderId()).orElseThrow().getRefundState());
        verifyNoInteractions(gateway);
    }

    @Test void upgradedTermsRequireManualReviewAndRejectNeverTouchesProvider() {
        Member owner = member(false), admin = member(true);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        transactions.executeWithoutResult(tx -> paid.findByPaymentReference(charge.getPaymentKey()).orElseThrow()
                .upgradeTo("STANDARD", 70));
        refunds.request(owner.getId(), charge.getOrderId(), "검토 요청");
        assertEquals("BILLING_REFUND_MANUAL_REVIEW", assertThrows(ApiException.class,
                () -> refunds.approve(charge.getOrderId(), 3900, true, "검토 완료", admin)).getCode());
        assertEquals("REJECTED", refunds.reject(charge.getOrderId(), "별도 검토 안내", admin).refundState());
        assertEquals("STANDARD", periods.at(owner.getId(), now).plan());
        assertFalse(billing.status(owner.getId()).autoRenew());
        verifyNoInteractions(gateway);
    }

    @Test void nullableLegacyScopeRemainsCompatibleWithoutBackfill() {
        Member owner = member(false);
        paidOrder(owner, null);
        assertEquals("LIGHT", periods.at(owner.getId(), now).plan());
        assertEquals("ACTIVE", billing.status(owner.getId()).paymentStatus());
        assertEquals(1, refunds.history(owner.getId()).size());
    }

    @Test void anotherStoreNeverGrantsAccessAppearsInHistoryOrRenews() {
        Member owner = member(false);
        BillingCharge charge = paidOrder(owner, "live:other_store");
        assertEquals("FREE", periods.at(owner.getId(), now).plan());
        assertTrue(refunds.history(owner.getId()).isEmpty());
        assertEquals("NOT_REGISTERED", billing.status(owner.getId()).paymentStatus());
        assertFalse(subscriptions.dueMemberIds(now, BillingContext.LEGACY_TEST).contains(owner.getId()));
        verify(gateway, never()).charge(anyString(), anyString(), anyString(), anyInt(), anyString());
        assertEquals("BILLING_STORE_MISMATCH", assertThrows(ApiException.class,
                () -> billing.setup(owner.getId())).getCode());
        assertEquals("BILLING_STORE_MISMATCH", assertThrows(ApiException.class,
                () -> refunds.request(owner.getId(), charge.getOrderId(), "검토 요청")).getCode());
    }

    @Test void ownerOnlyRequestsAndOnlyAdminsApproveWithoutLeakingPaymentKeys() throws Exception {
        Member owner = member(false), stranger = member(false);
        BillingCharge charge = paidOrder(owner, BillingContext.LEGACY_TEST);
        String userToken = "Bearer " + auth.issueAccessToken(owner);
        mvc.perform(get("/api/me/billing/charges").header("Authorization", userToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].orderId").value(charge.getOrderId()))
                .andExpect(jsonPath("$[0].paymentKey").doesNotExist())
                .andExpect(jsonPath("$[0].billingKey").doesNotExist());
        mvc.perform(post("/api/me/billing/charges/" + charge.getOrderId() + "/refund-request")
                .header("Authorization", "Bearer " + auth.issueAccessToken(stranger))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"review\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/billing/refunds/" + charge.getOrderId() + "/approve")
                .header("Authorization", userToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedAmount\":3900,\"recordsReviewed\":true,\"reason\":\"review\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/billing/refunds").header("Authorization", userToken))
                .andExpect(status().isForbidden());
        verifyNoInteractions(gateway);
    }
}
