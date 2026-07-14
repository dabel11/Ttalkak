package com.ttalkak.common.config;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AdminAccountInitializer implements ApplicationRunner {

    private static final Logger log =
            LoggerFactory.getLogger(AdminAccountInitializer.class);

    private static final int MIN_ADMIN_PASSWORD_LENGTH = 12;

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${ttalkak.admin.seed-enabled:false}")
    private boolean seedEnabled;

    @Value("${ttalkak.admin.user-id:admin}")
    private String adminUserId;

    @Value("${ttalkak.admin.password:}")
    private String adminPassword;

    @Value("${ttalkak.admin.nickname:admin}")
    private String adminNickname;

    @Value("${ttalkak.admin.name:관리자}")
    private String adminName;

    public AdminAccountInitializer(
            MemberRepository memberRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seedEnabled) {
            log.info("관리자 계정 자동 생성을 사용하지 않습니다.");
            return;
        }

        validateSeedConfiguration();

        Member existingAdmin = memberRepository
                .findByUserId(adminUserId)
                .orElse(null);

        if (existingAdmin == null) {
            String nickname = findAvailableNickname(adminNickname);

            Member admin = Member.createAdmin(
                    adminUserId,
                    passwordEncoder.encode(adminPassword),
                    nickname,
                    adminName
            );

            memberRepository.save(admin);

            log.info(
                    "환경변수 설정을 사용해 관리자 계정을 생성했습니다. userId={}",
                    adminUserId
            );

            return;
        }

        boolean passwordMatches = passwordEncoder.matches(
                adminPassword,
                existingAdmin.getPassword()
        );

        String nickname = resolveNickname(existingAdmin);

        boolean needsUpdate =
                !passwordMatches
                        || !"ADMIN".equalsIgnoreCase(
                                existingAdmin.getRole()
                        )
                        || !existingAdmin.isActive()
                        || !nickname.equals(
                                existingAdmin.getNickname()
                        )
                        || !adminName.equals(
                                existingAdmin.getName()
                        );

        if (!needsUpdate) {
            log.info(
                    "관리자 계정이 이미 정상적으로 설정되어 있습니다. userId={}",
                    adminUserId
            );

            return;
        }

        String encodedPassword = passwordMatches
                ? existingAdmin.getPassword()
                : passwordEncoder.encode(adminPassword);

        existingAdmin.synchronizeAdminAccount(
                encodedPassword,
                nickname,
                adminName
        );

        memberRepository.save(existingAdmin);

        log.info(
                "환경변수 설정을 사용해 관리자 계정을 동기화했습니다. userId={}",
                adminUserId
        );
    }

    private void validateSeedConfiguration() {
        if (adminUserId == null || adminUserId.isBlank()) {
            throw new IllegalStateException(
                    "관리자 자동 생성을 사용하려면 "
                            + "ADMIN_USER_ID를 설정해야 합니다."
            );
        }

        if (adminPassword == null || adminPassword.isBlank()) {
            throw new IllegalStateException(
                    "관리자 자동 생성을 사용하려면 "
                            + "ADMIN_PASSWORD를 설정해야 합니다."
            );
        }

        if (adminPassword.length() < MIN_ADMIN_PASSWORD_LENGTH) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD는 최소 "
                            + MIN_ADMIN_PASSWORD_LENGTH
                            + "자 이상이어야 합니다."
            );
        }

        if (adminNickname == null || adminNickname.isBlank()) {
            throw new IllegalStateException(
                    "관리자 자동 생성을 사용하려면 "
                            + "ADMIN_NICKNAME을 설정해야 합니다."
            );
        }

        if (adminName == null || adminName.isBlank()) {
            throw new IllegalStateException(
                    "관리자 자동 생성을 사용하려면 "
                            + "ADMIN_NAME을 설정해야 합니다."
            );
        }
    }

    private String resolveNickname(Member existingAdmin) {
        if (adminNickname.equals(existingAdmin.getNickname())) {
            return adminNickname;
        }

        if (!memberRepository.existsByNickname(adminNickname)) {
            return adminNickname;
        }

        return existingAdmin.getNickname();
    }

    private String findAvailableNickname(String requestedNickname) {
        if (!memberRepository.existsByNickname(requestedNickname)) {
            return requestedNickname;
        }

        int suffix = 1;
        String candidate;

        do {
            candidate = requestedNickname + "_" + suffix;
            suffix++;
        }
        while (memberRepository.existsByNickname(candidate));

        return candidate;
    }
}
