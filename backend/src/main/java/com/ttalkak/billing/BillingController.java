package com.ttalkak.billing;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me/billing")
public class BillingController {
    private final AuthService auth;
    private final BillingService billing;

    public BillingController(AuthService auth, BillingService billing) {
        this.auth = auth;
        this.billing = billing;
    }

    private Long member(String authorization) {
        Long id = auth.currentMemberIdOrNull(authorization);
        if (id == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
        return id;
    }

    @GetMapping
    public BillingService.Status status(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return billing.status(member(authorization));
    }

    @PostMapping("/setup")
    public BillingService.Setup setup(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return billing.setup(member(authorization));
    }

    @PostMapping("/complete")
    public BillingService.Status complete(@RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CompleteRequest request) {
        return billing.completeRegistration(member(authorization), request.customerKey(), request.authKey());
    }

    @PostMapping("/retry")
    public BillingService.Status retry(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return billing.retry(member(authorization));
    }

    @PostMapping("/cancel")
    public BillingService.Status cancel(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return billing.cancelRenewal(member(authorization));
    }

    public record CompleteRequest(String customerKey, String authKey) {}
}
