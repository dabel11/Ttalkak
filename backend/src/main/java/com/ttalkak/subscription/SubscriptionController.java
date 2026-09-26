package com.ttalkak.subscription;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {
    private final AuthService authService;
    private final SubscriptionService subscriptionService;

    public SubscriptionController(AuthService authService, SubscriptionService subscriptionService) {
        this.authService = authService;
        this.subscriptionService = subscriptionService;
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return subscriptionService.current(requireMember(authorization));
    }

    @PostMapping("/checkout")
    public Map<String, Object> checkout(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) CheckoutRequest request
    ) {
        return subscriptionService.checkout(requireMember(authorization), request == null ? "PRO" : request.plan());
    }

    @PostMapping("/portal")
    public Map<String, Object> portal(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return subscriptionService.portal(requireMember(authorization));
    }

    private Long requireMember(String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
        return memberId;
    }

    public record CheckoutRequest(String plan) {}
}
