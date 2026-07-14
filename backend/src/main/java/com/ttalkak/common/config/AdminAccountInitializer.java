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

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${ttalkak.admin.seed-enabled:true}")
    private boolean seedEnabled;

    @Value("${ttalkak.admin.user-id:admin}")
    private String adminUserId;

    @Value("${ttalkak.admin.password:Admin1234!}")
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

        Member existingAdmin = memberRepository.findByUserId(adminUserId)
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
            log.info("개발용 관리자 계정을 생성했습니다. userId={}", adminUserId);
            return;
        }

        boolean passwordMatches = passwordEncoder.matches(
                adminPassword,
                existingAdmin.getPassword()
        );

        String nickname = resolveNickname(existingAdmin);
        boolean needsUpdate =
                !passwordMatches
                        || !"ADMIN".equalsIgnoreCase(existingAdmin.getRole())
                        || !existingAdmin.isActive()
                        || !nickname.equals(existingAdmin.getNickname())
                        || !adminName.equals(existingAdmin.getName());

        if (!needsUpdate) {
            log.info("관리자 계정이 이미 정상적으로 설정되어 있습니다. userId={}", adminUserId);
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
        log.info("관리자 계정 설정을 동기화했습니다. userId={}", adminUserId);
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
        } while (memberRepository.existsByNickname(candidate));

        return candidate;
    }
}
