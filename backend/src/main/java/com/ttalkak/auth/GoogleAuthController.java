package com.ttalkak.auth;

import com.ttalkak.auth.GoogleAuthService.GoogleLoginResult;
import com.ttalkak.member.Member;
import org.springframework.http.ResponseEntity;
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

    public GoogleAuthController(
            GoogleAuthService googleAuthService,
            AuthService authService
    ) {
        this.googleAuthService = googleAuthService;
        this.authService = authService;
    }

    @PostMapping("/google")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody GoogleLoginRequest request
    ) {
        GoogleLoginResult result = googleAuthService.login(
                request == null
                        ? null
                        : request.credential()
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

    public record GoogleLoginRequest(String credential) {
    }
}
