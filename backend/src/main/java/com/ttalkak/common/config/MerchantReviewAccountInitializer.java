package com.ttalkak.common.config;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Opt-in, ordinary member for PG review. Never changes an existing identity. */
@Component
public class MerchantReviewAccountInitializer implements ApplicationRunner {
    public static final String USER_ID = "ttalkak_review";
    private final MemberRepository members;
    private final PasswordEncoder encoder;
    private final boolean enabled;
    private final String password;

    public MerchantReviewAccountInitializer(
            MemberRepository members,
            PasswordEncoder encoder,
            @Value("${MERCHANT_REVIEW_ACCOUNT_ENABLED:false}") boolean enabled,
            @Value("${MERCHANT_REVIEW_ACCOUNT_PASSWORD:}") String password) {
        this.members = members;
        this.encoder = encoder;
        this.enabled = enabled;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (password == null || password.length() < 12
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("심사 계정 비밀번호는 12자 이상, UTF-8 72바이트 이내로 설정해야 합니다.");
        }
        Member existing = members.findByUserId(USER_ID).orElse(null);
        if (existing != null) {
            if (!existing.isLocalAccount() || !"USER".equals(existing.getRole())
                    || !existing.isActive() || existing.isBlocked() || existing.getEmail() != null
                    || !encoder.matches(password, existing.getPassword())) {
                throw new IllegalStateException("기존 심사 아이디와 설정이 일치하지 않습니다. 계정을 자동 변경하지 않습니다.");
            }
            return;
        }
        String nickname = members.existsByNicknameAndActiveTrue("TTALKAK심사")
                ? USER_ID : "TTALKAK심사";
        if (members.existsByNicknameAndActiveTrue(nickname)) {
            throw new IllegalStateException("심사 계정 닉네임이 이미 사용 중입니다.");
        }
        members.save(new Member(USER_ID, encoder.encode(password), nickname,
                "TTALKAK 심사 계정", null, null, null));
    }
}
