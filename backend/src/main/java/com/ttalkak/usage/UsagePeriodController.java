package com.ttalkak.usage;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/usage")
public class UsagePeriodController {
    private final AuthService authService;
    private final UsagePeriodService periods;

    public UsagePeriodController(AuthService authService, UsagePeriodService periods) {
        this.authService = authService;
        this.periods = periods;
    }

    @GetMapping
    public UsagePeriodService.Snapshot current(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
        }
        return periods.current(memberId);
    }
}
