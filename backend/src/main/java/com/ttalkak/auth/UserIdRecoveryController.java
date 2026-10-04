package com.ttalkak.auth;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class UserIdRecoveryController {
    private final PasswordResetDispatcher dispatcher;
    public UserIdRecoveryController(PasswordResetDispatcher dispatcher) { this.dispatcher = dispatcher; }
    @PostMapping("/api/auth/id-recovery/request")
    public Map<String, Object> request(@RequestBody Request request) {
        dispatcher.recoverUserId(request.name(), request.email());
        return Map.of("ok", true, "message", "입력한 정보와 일치하는 계정이 있으면 아이디를 메일로 발송합니다.");
    }
    public record Request(String name, String email) { }
}
