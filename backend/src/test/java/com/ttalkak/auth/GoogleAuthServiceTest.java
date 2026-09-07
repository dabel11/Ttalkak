package com.ttalkak.auth;

import com.ttalkak.auth.GoogleIdTokenVerifier.GoogleIdentity;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GoogleAuthServiceTest {

    private GoogleIdTokenVerifier verifier;
    private MemberRepository memberRepository;
    private PasswordEncoder passwordEncoder;
    private GoogleAuthService googleAuthService;

    @BeforeEach
    void setUp() {
        verifier = mock(GoogleIdTokenVerifier.class);
        memberRepository = mock(MemberRepository.class);
        passwordEncoder = new BCryptPasswordEncoder();

        googleAuthService = new GoogleAuthService(
                verifier,
                memberRepository,
                passwordEncoder
        );
    }

    @Test
    void createsNewGoogleMember() {
        GoogleIdentity identity = identity();

        when(verifier.verify("credential"))
                .thenReturn(identity);
        when(memberRepository
                .findByAuthProviderAndProviderSubject(
                        Member.PROVIDER_GOOGLE,
                        identity.subject()
                ))
                .thenReturn(Optional.empty());
        when(memberRepository.existsByUserId(anyString()))
                .thenReturn(false);
        when(memberRepository.existsByNickname(anyString()))
                .thenReturn(false);
        when(memberRepository.save(any(Member.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        GoogleAuthService.GoogleLoginResult result =
                googleAuthService.login("credential");

        assertTrue(result.newMember());
        assertTrue(result.member().isGoogleAccount());
        assertEquals(
                identity.subject(),
                result.member().getProviderSubject()
        );
        assertEquals(
                identity.email(),
                result.member().getEmail()
        );
        assertTrue(
                result.member()
                        .getUserId()
                        .startsWith("google_")
        );
    }

    @Test
    void reusesExistingGoogleMember() {
        GoogleIdentity identity = identity();

        Member existing = Member.createGoogle(
                "google_existing",
                "encoded-password",
                "기존사용자",
                "기존 이름",
                "old@example.com",
                identity.subject()
        );

        when(verifier.verify("credential"))
                .thenReturn(identity);
        when(memberRepository
                .findByAuthProviderAndProviderSubject(
                        Member.PROVIDER_GOOGLE,
                        identity.subject()
                ))
                .thenReturn(Optional.of(existing));
        when(memberRepository.save(existing))
                .thenReturn(existing);

        GoogleAuthService.GoogleLoginResult result =
                googleAuthService.login("credential");

        assertFalse(result.newMember());
        assertSame(existing, result.member());
        assertEquals(
                identity.email(),
                existing.getEmail()
        );
        assertEquals(identity.name(), existing.getName());
    }

    @Test
    void rejectsWithdrawnGoogleMember() {
        GoogleIdentity identity = identity();

        Member withdrawn = Member.createGoogle(
                "google_withdrawn",
                "encoded-password",
                "탈퇴예정",
                "탈퇴 사용자",
                identity.email(),
                identity.subject()
        );

        withdrawn.withdraw();

        when(verifier.verify("credential"))
                .thenReturn(identity);
        when(memberRepository
                .findByAuthProviderAndProviderSubject(
                        Member.PROVIDER_GOOGLE,
                        identity.subject()
                ))
                .thenReturn(Optional.of(withdrawn));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> googleAuthService.login("credential")
        );

        assertEquals(
                HttpStatus.FORBIDDEN,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsBlockedGoogleMember() {
    GoogleIdentity identity = identity();

    Member blocked = Member.createGoogle(
            "google_blocked",
            "encoded-password",
            "차단회원",
            "차단 사용자",
            identity.email(),
            identity.subject()
   );

    blocked.block("반복적인 이용약관 위반");

    when(verifier.verify("credential"))
            .thenReturn(identity);

    when(memberRepository
            .findByAuthProviderAndProviderSubject(
                    Member.PROVIDER_GOOGLE,
                    identity.subject()
            ))
            .thenReturn(Optional.of(blocked));

    ApiException exception = assertThrows(
            ApiException.class,
            () -> googleAuthService.login("credential")
    );

    assertEquals(
            HttpStatus.FORBIDDEN,
            exception.getStatusCode()
    );

    assertEquals(
            "ACCOUNT_BLOCKED",
            exception.getCode()
    );
    }

    private GoogleIdentity identity() {
        return new GoogleIdentity(
                "google-subject-1",
                "user@example.com",
                "테스트 사용자",
                "https://example.com/profile.png"
        );
    }
}
