package com.ttalkak.auth;

import com.ttalkak.auth.dto.*;
import com.ttalkak.common.exception.CustomException;
import com.ttalkak.common.exception.ErrorCode;
import com.ttalkak.member.AuthProvider;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final MemberService memberService;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final WebClient webClient;

    @Transactional
    public TokenResponse signup(SignupRequest request) {
        if (memberService.existsByEmail(request.getEmail())) {
            throw new CustomException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        if (memberService.existsByNickname(request.getNickname())) {
            throw new CustomException(ErrorCode.NICKNAME_ALREADY_EXISTS);
        }

        Member member = Member.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .nickname(request.getNickname())
                .authProvider(AuthProvider.LOCAL)
                .build();

        member = memberService.save(member);
        return generateTokenResponse(member);
    }

    public TokenResponse login(LoginRequest request) {
        Member member = memberService.findByEmail(request.getEmail());

        if (member.getPassword() == null || !passwordEncoder.matches(request.getPassword(), member.getPassword())) {
            throw new CustomException(ErrorCode.INVALID_CREDENTIALS);
        }

        return generateTokenResponse(member);
    }

    @Transactional
    public TokenResponse googleLogin(GoogleLoginRequest request) {
        Map<String, Object> googleInfo = verifyGoogleToken(request.getIdToken());

        String email = (String) googleInfo.get("email");
        String name = (String) googleInfo.getOrDefault("name", email.split("@")[0]);

        Member member;
        if (memberService.existsByEmail(email)) {
            member = memberService.findByEmail(email);
        } else {
            String nickname = generateUniqueNickname(name);
            member = Member.builder()
                    .email(email)
                    .nickname(nickname)
                    .authProvider(AuthProvider.GOOGLE)
                    .build();
            member = memberService.save(member);
        }

        return generateTokenResponse(member);
    }

    public TokenResponse refresh(RefreshRequest request) {
        String refreshToken = request.getRefreshToken();

        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new CustomException(ErrorCode.INVALID_TOKEN);
        }

        Claims claims = jwtTokenProvider.parseClaims(refreshToken);
        if (!"refresh".equals(claims.get("type", String.class))) {
            throw new CustomException(ErrorCode.INVALID_TOKEN);
        }

        Long memberId = Long.parseLong(claims.getSubject());
        Member member = memberService.findById(memberId);

        return generateTokenResponse(member);
    }

    private TokenResponse generateTokenResponse(Member member) {
        String accessToken = jwtTokenProvider.createAccessToken(
                member.getId(), member.getEmail(), member.getRole().name());
        String refreshToken = jwtTokenProvider.createRefreshToken(
                member.getId(), member.getEmail(), member.getRole().name());

        return TokenResponse.of(accessToken, refreshToken,
                member.getId(), member.getEmail(), member.getNickname());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> verifyGoogleToken(String idToken) {
        try {
            return webClient.get()
                    .uri("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
        } catch (Exception e) {
            log.warn("Google token verification failed: {}", e.getMessage());
            throw new CustomException(ErrorCode.INVALID_GOOGLE_TOKEN);
        }
    }

    private String generateUniqueNickname(String base) {
        String nickname = base.length() > 18 ? base.substring(0, 18) : base;
        if (!memberService.existsByNickname(nickname)) return nickname;
        for (int i = 1; i <= 999; i++) {
            String candidate = nickname + i;
            if (!memberService.existsByNickname(candidate)) return candidate;
        }
        return nickname + System.currentTimeMillis();
    }
}
