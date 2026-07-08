package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {
    private final MemberRepository memberRepository;

    public AuthService(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    public String issueDemoToken(Member member) {
        return "demo-token-" + member.getId();
    }

    public Optional<Member> getMemberFromAuthorization(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) return Optional.empty();
        String token = authorizationHeader.replace("Bearer", "").trim();
        if (!token.startsWith("demo-token-")) return Optional.empty();
        try {
            Long id = Long.parseLong(token.substring("demo-token-".length()));
            return memberRepository.findById(id);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    public String currentNickname(String authorizationHeader) {
        return getMemberFromAuthorization(authorizationHeader)
                .map(Member::getNickname)
                .orElse("익명 사용자");
    }

    public Long currentMemberIdOrNull(String authorizationHeader) {
        return getMemberFromAuthorization(authorizationHeader)
                .map(Member::getId)
                .orElse(null);
    }
}
