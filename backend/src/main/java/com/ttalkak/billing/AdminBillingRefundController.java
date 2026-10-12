package com.ttalkak.billing;

import com.ttalkak.member.Member;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/billing/refunds")
public class AdminBillingRefundController {
    private final BillingRefundService refunds;
    public AdminBillingRefundController(BillingRefundService refunds) { this.refunds = refunds; }
    @GetMapping
    public java.util.List<BillingRefundService.ChargeView> queue(@RequestParam(defaultValue = "REQUESTED") String state) {
        return refunds.queue(state);
    }
    @PostMapping("/{orderId}/approve")
    public BillingRefundService.ChargeView approve(@PathVariable String orderId, @RequestBody Approval request,
                                                  @AuthenticationPrincipal Member admin) {
        return refunds.approve(orderId, request.expectedAmount(), request.recordsReviewed(), request.reason(), admin);
    }
    @PostMapping("/{orderId}/reconcile")
    public BillingRefundService.ChargeView reconcile(@PathVariable String orderId, @AuthenticationPrincipal Member admin) {
        return refunds.reconcile(orderId, admin);
    }
    @PostMapping("/{orderId}/reject")
    public BillingRefundService.ChargeView reject(@PathVariable String orderId, @RequestBody Rejection request,
                                                 @AuthenticationPrincipal Member admin) {
        return refunds.reject(orderId, request.reason(), admin);
    }
    public record Approval(Integer expectedAmount, boolean recordsReviewed, String reason) {}
    public record Rejection(String reason) {}
}
