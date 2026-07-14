package com.ttalkak.auth;

import com.ttalkak.auth.GoogleIdTokenVerifier.GoogleIdentity;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;

@Service
public class AccountWithdrawalService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final GoogleIdTokenVerifier googleIdTokenVerifier;

    public AccountWithdrawalService(
            MemberRepository memberRepository,
            PasswordEncoder passwordEncoder,
            GoogleIdTokenVerifier googleIdTokenVerifier
    ) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.googleIdTokenVerifier = googleIdTokenVerifier;
    }

    @Transactional
    public void withdraw(
            Member member,
            String password,
            String googleCredential
    ) {
        if (member == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "로그인이 필요합니다."
            );
        }

        if (member.isLocalAccount()) {
            verifyLocalPassword(member, password);
        }
        else if (member.isGoogleAccount()) {
            verifyGoogleIdentity(member, googleCredential);
        }
        else {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "지원하지 않는 로그인 방식입니다."
            );
        }

        member.withdraw();
        memberRepository.save(member);
    }

    private void verifyLocalPassword(
            Member member,
            String password
    ) {
        if (password == null || password.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "회원탈퇴를 위해 비밀번호를 입력해주세요."
            );
        }

        if (!passwordEncoder.matches(
                password,
                member.getPassword()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "비밀번호가 올바르지 않습니다."
            );
        }
    }

    private void verifyGoogleIdentity(
            Member member,
            String credential
    ) {
        if (credential == null || credential.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "회원탈퇴를 위해 Google 재인증이 필요합니다."
            );
        }

        GoogleIdentity identity =
                googleIdTokenVerifier.verify(credential);

        if (!Objects.equals(
                member.getProviderSubject(),
                identity.subject()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "현재 로그인한 Google 계정과 일치하지 않습니다."
            );
        }
    }
}
