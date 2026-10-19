package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthSessionController {
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
    private final AuthService auth;
    private final MemberRepository members;
    private final PasswordEncoder encoder;
    public AuthSessionController(AuthService auth, MemberRepository members, PasswordEncoder encoder) {
        this.auth = auth; this.members = members; this.encoder = encoder;
    }
    @GetMapping("/me")
    public Map<String, Object> me(@RequestHeader(value="Authorization", required=false) String authorization) {
        Member member = requireMember(authorization);
        return Map.of("user", Map.of("id", member.getId(), "userId", member.getUserId(),
                "nickname", member.getNickname(), "role", member.getRole().toLowerCase(java.util.Locale.ROOT),
                "provider", member.getAuthProvider().toLowerCase(java.util.Locale.ROOT), "active", member.isActive()));
    }
    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestHeader(value="Authorization", required=false) String authorization) {
        requireMember(authorization);
        auth.revokeCurrentToken(authorization);
        return Map.of("ok", true, "scope", "current_session");
    }
    @PostMapping("/logout-all")
    @Transactional
    public Map<String, Object> logoutAll(@RequestHeader(value="Authorization", required=false) String authorization) {
        Member member = requireMember(authorization);
        Member locked = members.lockById(member.getId()).orElseThrow(AuthSessionController::loginRequired);
        entityManager.refresh(locked, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        requireMember(authorization);
        locked.invalidateSessions();
        members.save(locked);
        return Map.of("ok", true, "scope", "all_sessions");
    }
    @PostMapping("/password/change")
    @Transactional
    public Map<String, Object> change(@RequestHeader(value="Authorization", required=false) String authorization,
                                     @RequestBody ChangePassword request) {
        Member member = requireMember(authorization);
        Member locked = members.lockById(member.getId()).orElseThrow(AuthSessionController::loginRequired);
        entityManager.refresh(locked, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        requireMember(authorization);
        if (!locked.isLocalAccount()) throw new ApiException(HttpStatus.BAD_REQUEST,
                "PASSWORD_LOGIN_NOT_SUPPORTED", "Google 계정은 Google에서 비밀번호를 변경해주세요.");
        if (request.currentPassword() == null || !encoder.matches(request.currentPassword(), locked.getPassword())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "PASSWORD_MISMATCH", "현재 비밀번호가 올바르지 않습니다.");
        }
        String password = request.newPassword();
        if (password == null || password.length() < 8 || password.getBytes(StandardCharsets.UTF_8).length > 72
                || !password.equals(request.passwordConfirm())) throw new ApiException(HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST", "새 비밀번호와 확인을 올바르게 입력해주세요.");
        locked.changePassword(encoder.encode(password));
        members.save(locked);
        return Map.of("ok", true, "loginRequired", true);
    }
    private Member requireMember(String authorization) {
        return auth.getMemberFromAuthorization(authorization).orElseThrow(AuthSessionController::loginRequired);
    }
    private static ApiException loginRequired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
    }
    public record ChangePassword(String currentPassword, String newPassword, String passwordConfirm) { }
}
