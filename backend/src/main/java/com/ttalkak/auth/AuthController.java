package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthService authService;

    public AuthController(MemberRepository memberRepository, PasswordEncoder passwordEncoder, AuthService authService) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest request) {
        if (request.userId() == null || request.userId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "아이디를 입력해주세요."));
        }
        if (memberRepository.existsByUserId(request.userId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "이미 사용 중인 아이디입니다."));
        }
        if (memberRepository.existsByNickname(request.nickname())) {
            return ResponseEntity.badRequest().body(Map.of("message", "이미 사용 중인 닉네임입니다."));
        }
        if (!Boolean.TRUE.equals(request.agreeTerms()) || !Boolean.TRUE.equals(request.agreePrivacy())) {
            return ResponseEntity.badRequest().body(Map.of("message", "약관과 개인정보 수집 및 이용에 동의해주세요."));
        }
        LocalDate birth = null;
        if (request.birth() != null && !request.birth().isBlank()) {
            birth = LocalDate.parse(request.birth());
        }
        Member member = new Member(
                request.userId(),
                passwordEncoder.encode(request.password()),
                request.nickname(),
                request.name(),
                birth,
                request.phone(),
                request.email()
        );
        memberRepository.save(member);
        return ResponseEntity.ok(authResponse(member));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        Member member = memberRepository.findByUserId(request.userId())
                .orElse(null);
        if (member == null || !passwordEncoder.matches(request.password(), member.getPassword())) {
            return ResponseEntity.status(401).body(Map.of("message", "아이디 또는 비밀번호가 올바르지 않습니다."));
        }
        return ResponseEntity.ok(authResponse(member));
    }

    @GetMapping("/check-user-id")
    public Map<String, Object> checkUserId(@RequestParam String userId) {
        boolean available = !memberRepository.existsByUserId(userId);
        return Map.of("available", available);
    }

    @GetMapping("/check-nickname")
    public Map<String, Object> checkNickname(@RequestParam String nickname) {
        boolean available = !memberRepository.existsByNickname(nickname);
        return Map.of("available", available);
    }

    @PostMapping("/find-id")
    public ResponseEntity<?> findId(@RequestBody FindIdRequest request) {
        Member member = "email".equals(request.method())
                ? memberRepository.findByNameAndEmail(request.name(), request.email()).orElse(null)
                : memberRepository.findByNameAndPhone(request.name(), request.phone()).orElse(null);
        if (member == null) {
            return ResponseEntity.ok(Map.of("maskedUserId", ""));
        }
        return ResponseEntity.ok(Map.of("maskedUserId", maskUserId(member.getUserId())));
    }

    @PostMapping("/password-reset/request")
    public Map<String, Object> requestPasswordReset(@RequestBody PasswordResetRequest request) {
        return Map.of("ok", true);
    }

    private Map<String, Object> authResponse(Member member) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", member.getId());
        user.put("userId", member.getUserId());
        user.put("nickname", member.getNickname());
        user.put("role", member.getRole().toLowerCase());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", user);
        body.put("accessToken", authService.issueDemoToken(member));
        return body;
    }

    private String maskUserId(String userId) {
        if (userId == null || userId.length() <= 2) return "**";
        return userId.charAt(0) + "***" + userId.charAt(userId.length() - 1);
    }

    public record SignupRequest(String nickname, String name, String birth, String phone, String email, String userId, String password, String passwordConfirm, Boolean agreeTerms, Boolean agreePrivacy) {}
    public record LoginRequest(String userId, String password) {}
    public record FindIdRequest(String method, String name, String phone, String email) {}
    public record PasswordResetRequest(String userId, String phone, String email) {}
}
