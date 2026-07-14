package com.ttalkak.auth;

import com.ttalkak.auth.GoogleIdTokenVerifier.GoogleIdentity;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

@Service
public class GoogleAuthService {

    private static final int USER_ID_MAX_LENGTH = 50;
    private static final int NICKNAME_MAX_LENGTH = 50;
    private static final int NAME_MAX_LENGTH = 50;

    private final GoogleIdTokenVerifier tokenVerifier;
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    public GoogleAuthService(
            GoogleIdTokenVerifier tokenVerifier,
            MemberRepository memberRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.tokenVerifier = tokenVerifier;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public GoogleLoginResult login(String credential) {
        GoogleIdentity identity = tokenVerifier.verify(
                credential
        );

        Member existing = memberRepository
                .findByAuthProviderAndProviderSubject(
                        Member.PROVIDER_GOOGLE,
                        identity.subject()
                )
                .orElse(null);

        if (existing != null) {
            if (!existing.isActive()) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "탈퇴한 Google 계정입니다."
                );
            }

            existing.synchronizeGoogleProfile(
                    resolveName(identity),
                    identity.email()
            );

            memberRepository.save(existing);

            return new GoogleLoginResult(
                    existing,
                    false,
                    identity.picture()
            );
        }

        String hash = sha256(identity.subject());

        String userId = findAvailableUserId(hash);
        String nickname = findAvailableNickname(
                resolveNicknameBase(identity),
                hash
        );
        String encodedPassword = passwordEncoder.encode(UUID.randomUUID().toString());

        Member created = Member.createGoogle(
                userId,
                encodedPassword,
                nickname,
                resolveName(identity),
                identity.email(),
                identity.subject()
        );

        memberRepository.save(created);

        return new GoogleLoginResult(
                created,
                true,
                identity.picture()
        );
    }

    private String findAvailableUserId(String hash) {
        String base = "google_" + hash.substring(0, 32);
        String candidate = base;
        int suffix = 1;

        while (memberRepository.existsByUserId(candidate)) {
            String tail = "_" + suffix;
            int baseLength = USER_ID_MAX_LENGTH
                    - tail.length();

            candidate = truncate(base, baseLength) + tail;
            suffix++;
        }

        return candidate;
    }

    private String findAvailableNickname(
            String requestedBase,
            String hash
    ) {
        String base = sanitizeNickname(requestedBase);

        if (base.isBlank()) {
            base = "구글사용자";
        }

        String stableSuffix = "_" + hash.substring(0, 6);
        String candidate = truncate(
                base,
                NICKNAME_MAX_LENGTH - stableSuffix.length()
        ) + stableSuffix;

        int sequence = 1;

        while (memberRepository.existsByNickname(candidate)) {
            String tail = stableSuffix + "_" + sequence;
            int baseLength = NICKNAME_MAX_LENGTH
                    - tail.length();

            candidate = truncate(base, baseLength) + tail;
            sequence++;
        }

        return candidate;
    }

    private String resolveName(GoogleIdentity identity) {
        String name = identity.name();

        if (name == null || name.isBlank()) {
            int at = identity.email().indexOf("@");

            name = at > 0
                    ? identity.email().substring(0, at)
                    : "Google 사용자";
        }

        name = name
                .replaceAll("[\\r\\n\\t]", " ")
                .trim();

        return truncate(name, NAME_MAX_LENGTH);
    }

    private String resolveNicknameBase(
            GoogleIdentity identity
    ) {
        String name = identity.name();

        if (name != null && !name.isBlank()) {
            return name;
        }

        int at = identity.email().indexOf("@");

        return at > 0
                ? identity.email().substring(0, at)
                : "구글사용자";
    }

    private String sanitizeNickname(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replaceAll("[\\p{Cntrl}]", "")
                .replaceAll("\\s+", "")
                .trim();
    }

    private String truncate(String value, int maxLength) {
        if (value.length() <= maxLength) {
            return value;
        }

        return value.substring(0, maxLength);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance(
                    "SHA-256"
            );

            byte[] bytes = digest.digest(
                    value.getBytes(StandardCharsets.UTF_8)
            );

            return HexFormat.of()
                    .formatHex(bytes)
                    .toLowerCase(Locale.ROOT);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 알고리즘을 사용할 수 없습니다.",
                    exception
            );
        }
    }

    public record GoogleLoginResult(
            Member member,
            boolean newMember,
            String picture
    ) {
    }
}
