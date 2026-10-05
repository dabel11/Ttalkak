package com.ttalkak.auth;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth/password-reset")
public class PasswordRecoveryController {
    private final PasswordResetDispatcher dispatcher;
    private final PasswordResetService service;
    public PasswordRecoveryController(PasswordResetDispatcher dispatcher, PasswordResetService service) {
        this.dispatcher = dispatcher; this.service = service;
    }
    @PostMapping("/request")
    public Map<String, Object> request(@RequestBody Request request) {
        dispatcher.request(request.userId(), request.email());
        return Map.of("ok", true, "message", "입력한 정보와 일치하는 계정이 있으면 재설정 메일을 발송합니다.");
    }
    @PostMapping("/complete")
    public Map<String, Object> complete(@RequestBody Complete request) {
        service.complete(request.token(), request.newPassword(), request.passwordConfirm());
        return Map.of("ok", true, "loginRequired", true);
    }
    public record Request(String userId, String email) { }
    public record Complete(String token, String newPassword, String passwordConfirm) { }
}
