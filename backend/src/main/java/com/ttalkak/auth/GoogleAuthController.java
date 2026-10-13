package com.ttalkak.auth;

import com.ttalkak.auth.GoogleAuthService.GoogleLoginResult;
import com.ttalkak.member.Member;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class GoogleAuthController {

    private final GoogleAuthService googleAuthService;
    private final AuthService authService;

    @Value("${GOOGLE_CLIENT_ID:}")
    private String googleClientId = "";

    public GoogleAuthController(
            GoogleAuthService googleAuthService,
            AuthService authService
    ) {
        this.googleAuthService = googleAuthService;
        this.authService = authService;
    }

    @GetMapping("/google/config")
    public ResponseEntity<Map<String, String>> configuration() {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(Map.of("clientId", googleClientId.trim()));
    }

    @PostMapping("/google")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody GoogleLoginRequest request
    ) {
        GoogleLoginResult result = googleAuthService.login(
                request == null ? null : request.credential(),
                request != null && Boolean.TRUE.equals(request.agreeTerms()),
                request != null && Boolean.TRUE.equals(request.agreePrivacy())
        );

        Member member = result.member();

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", member.getId());
        user.put("userId", member.getUserId());
        user.put("nickname", member.getNickname());
        user.put("name", member.getName());
        user.put("email", member.getEmail());
        user.put(
                "provider",
                member.getAuthProvider().toLowerCase()
        );
        user.put("role", member.getRole().toLowerCase());
        user.put("active", member.isActive());
        user.put("picture", result.picture());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", user);
        body.put(
                "accessToken",
                authService.issueAccessToken(member)
        );
        body.put("newMember", result.newMember());

        return ResponseEntity.ok(body);
    }

    public record GoogleLoginRequest(String credential, Boolean agreeTerms, Boolean agreePrivacy) {
    }
}
