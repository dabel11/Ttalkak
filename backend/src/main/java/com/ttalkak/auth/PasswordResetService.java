package com.ttalkak.auth;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class PasswordResetService {
    private final MemberRepository members;
    private final PasswordResetTokenRepository tokens;
    private final PasswordResetMailer mailer;
    private final PasswordEncoder encoder;
    private final SecureRandom random = new SecureRandom();
    public PasswordResetService(MemberRepository members, PasswordResetTokenRepository tokens,
                                PasswordResetMailer mailer, PasswordEncoder encoder) {
        this.members = members; this.tokens = tokens; this.mailer = mailer; this.encoder = encoder;
    }

    @Transactional
    public void request(String userId, String email) {
        mailer.requireEnabled();
        if (userId == null || email == null || userId.length() > 50 || email.length() > 255) {
            throw invalid("아이디와 이메일을 확인해주세요.");
        }
        Member found = members.findByUserIdAndAuthProviderAndActiveTrue(userId, Member.PROVIDER_LOCAL).orElse(null);
        if (found == null) return;
        Member member = members.lockById(found.getId()).orElse(null);
        if (member == null || !member.isActive() || member.isBlocked() || !member.isLocalAccount()
                || !email.equalsIgnoreCase(member.getEmail())) return;
        Instant now = Instant.now();
        PasswordResetToken current = tokens.findById(member.getId()).orElse(null);
        if (current != null && current.getRequestedAt().plusSeconds(60).isAfter(now)) return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        if (current == null) current = new PasswordResetToken(member.getId(), hash(token), now);
        else current.renew(hash(token), now);
        tokens.saveAndFlush(current);
        mailer.send(member.getEmail(), token);
    }

    @Transactional
    public void complete(String token, String password, String confirmation) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalidToken();
        if (password == null || password.length() < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72
                || !password.equals(confirmation)) throw invalid("새 비밀번호와 확인을 올바르게 입력해주세요.");
        String hash = hash(token);
        PasswordResetToken found = tokens.findByTokenHash(hash).orElseThrow(PasswordResetService::invalidToken);
        Member member = members.lockById(found.getMemberId()).orElseThrow(PasswordResetService::invalidToken);
        // Re-read after member lock so concurrent requests/completions cannot reuse or supersede a token.
        PasswordResetToken locked = tokens.findByTokenHash(hash).orElseThrow(PasswordResetService::invalidToken);
        if (!locked.validAt(Instant.now()) || !member.isActive() || member.isBlocked()
                || !member.isLocalAccount()) throw invalidToken();
        member.changePassword(encoder.encode(password));
        members.save(member);
        tokens.delete(locked);
        tokens.flush();
    }
    public void recoverUserId(String name, String email) {
        var matches = members.findAllByNameAndEmailAndAuthProviderAndActiveTrue(name, email, Member.PROVIDER_LOCAL)
                .stream().filter(member -> !member.isBlocked()).toList();
        if (!matches.isEmpty()) {
            String ids = matches.stream().map(Member::getUserId).sorted()
                    .collect(java.util.stream.Collectors.joining(", "));
            mailer.sendUserId(matches.get(0).getEmail(), ids);
        }
    }
    static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    private static ApiException invalidToken() {
        return new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_RESET_TOKEN_INVALID", "재설정 코드가 잘못되었거나 만료되었습니다.");
    }
    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
    }
}
