package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

    private static final String BEARER_PREFIX = "Bearer ";

    private final MemberRepository memberRepository;
    private final JwtTokenService jwtTokenService;

    public AuthService(
            MemberRepository memberRepository,
            JwtTokenService jwtTokenService
    ) {
        this.memberRepository = memberRepository;
        this.jwtTokenService = jwtTokenService;
    }

    public String issueAccessToken(Member member) {
        return jwtTokenService.issueToken(member);
    }


    public Optional<Member> getMemberFromAuthorization(
            String authorizationHeader
    ) {
        return extractBearerToken(authorizationHeader)
                .flatMap(jwtTokenService::parseMemberId)
                .flatMap(memberRepository::findByIdAndActiveTrue)
                .map(member -> {
                    if (member.isBlocked()) {
                        throw new ApiException(
                                HttpStatus.FORBIDDEN,
                                "ACCOUNT_BLOCKED",
                                member.getBlockReason() == null
                                        || member.getBlockReason().isBlank()
                                        ? "관리자에 의해 이용이 제한된 계정입니다."
                                        : "관리자에 의해 이용이 제한된 계정입니다. 사유: "
                                        + member.getBlockReason()
                        );
                    }

                    return member;
                });
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

    private Optional<String> extractBearerToken(
            String authorizationHeader
    ) {
        if (authorizationHeader == null
                || authorizationHeader.isBlank()) {
            return Optional.empty();
        }

        if (!authorizationHeader.regionMatches(
                true,
                0,
                BEARER_PREFIX,
                0,
                BEARER_PREFIX.length()
        )) {
            return Optional.empty();
        }

        String token = authorizationHeader
                .substring(BEARER_PREFIX.length())
                .trim();

        return token.isBlank()
                ? Optional.empty()
                : Optional.of(token);
    }
}
