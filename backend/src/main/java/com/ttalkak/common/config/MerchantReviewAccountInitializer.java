package com.ttalkak.common.config;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.dao.DataIntegrityViolationException;

/** Opt-in, ordinary member for PG review. Never changes an existing identity. */
@Component
public class MerchantReviewAccountInitializer implements ApplicationRunner {
    public static final String USER_ID = "ttalkak_review";
    private static final String REVIEW_NAME = "TTALKAK 심사 계정";
    private static final Logger log = LoggerFactory.getLogger(MerchantReviewAccountInitializer.class);
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
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (password == null || password.length() < 12
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            log.warn("심사 계정 생성 생략: 비밀번호는 12자 이상, UTF-8 72바이트 이내로 설정해야 합니다.");
            return;
        }
        Member existing = members.findByUserId(USER_ID).orElse(null);
        if (existing != null) {
            if (!existing.isLocalAccount() || !"USER".equals(existing.getRole())
                    || !existing.isActive() || existing.isBlocked() || existing.getEmail() != null
                    || existing.getPhone() != null || existing.getBirth() != null
                    || !REVIEW_NAME.equals(existing.getName())
                    || !encoder.matches(password, existing.getPassword())) {
                log.warn("심사 계정 생성 생략: 기존 아이디와 설정이 일치하지 않습니다. 기존 계정은 변경하지 않습니다.");
            }
            return;
        }
        String nickname = members.existsByNicknameAndActiveTrue("TTALKAK심사")
                ? USER_ID : "TTALKAK심사";
        if (members.existsByNicknameAndActiveTrue(nickname)) {
            log.warn("심사 계정 생성 생략: 닉네임이 이미 사용 중입니다.");
            return;
        }
        // Repository save owns its transaction. A concurrent replica's unique-key
        // conflict must not roll back an outer startup transaction or stop the app.
        try {
            members.save(new Member(USER_ID, encoder.encode(password), nickname,
                    REVIEW_NAME, null, null, null));
            log.info("일반 심사 계정을 생성했습니다. 로그인 검증 후 생성 설정을 비활성화하세요.");
        } catch (DataIntegrityViolationException exception) {
            log.warn("심사 계정 생성 생략: 저장 충돌이 발생했습니다. 기존 계정은 변경하지 않습니다.");
        }
    }
}
