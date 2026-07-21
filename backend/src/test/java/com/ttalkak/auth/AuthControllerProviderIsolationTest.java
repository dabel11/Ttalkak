package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthControllerProviderIsolationTest {

    private MemberRepository memberRepository;
    private PasswordEncoder passwordEncoder;
    private AuthService authService;
    private AccountWithdrawalService withdrawalService;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        memberRepository = mock(MemberRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        authService = mock(AuthService.class);
        withdrawalService = mock(
                AccountWithdrawalService.class
        );

        controller = new AuthController(
                memberRepository,
                passwordEncoder,
                authService,
                withdrawalService
        );
    }

    @Test
    void logsInOnlyLocalMember() {
        Member member = localMember();

        when(memberRepository
                .findByUserIdAndAuthProviderAndActiveTrue(
                        "local-user",
                        Member.PROVIDER_LOCAL
                ))
                .thenReturn(Optional.of(member));
        when(passwordEncoder.matches(
                "password",
                "encoded-password"
        )).thenReturn(true);
        when(authService.issueAccessToken(member))
                .thenReturn("access-token");

        ResponseEntity<?> response = controller.login(
                new AuthController.LoginRequest(
                        "local-user",
                        "password"
                )
        );

        assertEquals(HttpStatus.OK, response.getStatusCode());

        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals("access-token", body.get("accessToken"));

        verify(memberRepository)
                .findByUserIdAndAuthProviderAndActiveTrue(
                        "local-user",
                        Member.PROVIDER_LOCAL
                );
    }

    @Test
    void rejectsBlockedLocalMember() {
        Member member = localMember();
        member.block("諛섎났?곸씤 ?댁슜?쎄? ?꾨컲");

        when(memberRepository
                .findByUserIdAndAuthProviderAndActiveTrue(
                        "local-user",
                        Member.PROVIDER_LOCAL
                ))
                .thenReturn(Optional.of(member));

                when(passwordEncoder.matches(
                        "password",
                        "encoded-password"
                )).thenReturn(true);

                ApiException exception = assertThrows(
                        ApiException.class,
                        () -> controller.login(
                                new AuthController.LoginRequest(
                                        "local-user",
                                        "password"
                                )
                        )
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

    @Test
    void rejectsUserIdThatIsNotLocalAccount() {
        when(memberRepository
                .findByUserIdAndAuthProviderAndActiveTrue(
                        "google_internal_id",
                        Member.PROVIDER_LOCAL
                ))
                .thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.login(
                        new AuthController.LoginRequest(
                                "google_internal_id",
                                "password"
                        )
                )
        );

        assertEquals(
                HttpStatus.UNAUTHORIZED,
                exception.getStatusCode()
        );
    }

    @Test
    void findsOnlyLocalUserIdByEmail() {
        Member member = localMember();

        when(memberRepository
                .findByNameAndEmailAndAuthProviderAndActiveTrue(
                        "Local User",
                        "local@example.com",
                        Member.PROVIDER_LOCAL
                ))
                .thenReturn(Optional.of(member));

        ResponseEntity<?> response = controller.findId(
                new AuthController.FindIdRequest(
                        "email",
                        "Local User",
                        null,
                        "local@example.com"
                )
        );

        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals("l***r", body.get("maskedUserId"));

        verify(memberRepository)
                .findByNameAndEmailAndAuthProviderAndActiveTrue(
                        "Local User",
                        "local@example.com",
                        Member.PROVIDER_LOCAL
                );
    }

    @Test
    void doesNotExposeGoogleInternalUserId() {
        when(memberRepository
                .findByNameAndEmailAndAuthProviderAndActiveTrue(
                        "Google User",
                        "google@example.com",
                        Member.PROVIDER_LOCAL
                ))
                .thenReturn(Optional.empty());

        ResponseEntity<?> response = controller.findId(
                new AuthController.FindIdRequest(
                        "email",
                        "Google User",
                        null,
                        "google@example.com"
                )
        );

        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals("", body.get("maskedUserId"));
    }

    private Member localMember() {
        return new Member(
                "local-user",
                "encoded-password",
                "local-nickname",
                "Local User",
                null,
                "010-0000-0000",
                "local@example.com"
        );
    }
}
