package com.ttalkak.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.dao.DataIntegrityViolationException;

class MerchantReviewAccountInitializerTest {
    private final MemberRepository members = mock(MemberRepository.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final String password = "fixture-review-123!";

    @Test void disabledDoesNotReadOrWriteMembers() {
        new MerchantReviewAccountInitializer(members, encoder, false, "").run(null);
        verifyNoInteractions(members);
    }

    @Test void enabledCreatesOrdinaryMemberWithoutPersonalContactDetails() {
        when(members.findByUserId(MerchantReviewAccountInitializer.USER_ID)).thenReturn(Optional.empty());
        new MerchantReviewAccountInitializer(members, encoder, true, password).run(null);
        ArgumentCaptor<Member> saved = ArgumentCaptor.forClass(Member.class);
        verify(members).save(saved.capture());
        Member member = saved.getValue();
        assertThat(member.getUserId()).isEqualTo("ttalkak_review");
        assertThat(member.getRole()).isEqualTo("USER");
        assertThat(member.getEmail()).isNull();
        assertThat(member.getPhone()).isNull();
        assertThat(member.getBirth()).isNull();
        assertThat(member.isLocalAccount()).isTrue();
        assertThat(member.isActive()).isTrue();
        assertThat(member.isBlocked()).isFalse();
        assertThat(member.getPassword()).isNotEqualTo(password);
        assertThat(encoder.matches(password, member.getPassword())).isTrue();
    }

    @Test void restartDoesNotOverwriteExistingMatchingAccount() {
        Member member = new Member("ttalkak_review", encoder.encode(password), "TTALKAK심사", "TTALKAK 심사 계정", null, null, null);
        when(members.findByUserId("ttalkak_review")).thenReturn(Optional.of(member));
        new MerchantReviewAccountInitializer(members, encoder, true, password).run(null);
        verify(members, never()).save(any());
    }

    @Test void doesNotChangeAnExistingAccountWithPersonalEmail() {
        Member member = new Member("ttalkak_review", encoder.encode(password), "existing", "existing", null, null, "fixture@example.test");
        when(members.findByUserId("ttalkak_review")).thenReturn(Optional.of(member));
        assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, password).run(null));
        verify(members, never()).save(any());
        assertThat(member.getEmail()).isEqualTo("fixture@example.test");
    }

    @Test void doesNotRotateExistingPasswordOrPromotePrivileges() {
        Member member = Member.createAdmin("ttalkak_review", encoder.encode("another-secret-123!"), "existing", "existing");
        when(members.findByUserId("ttalkak_review")).thenReturn(Optional.of(member));
        assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, password).run(null));
        verify(members, never()).save(any());
        assertThat(member.getRole()).isEqualTo("ADMIN");
    }

    @Test void refusesWeakOrTooLongSecretsBeforeTouchingDatabase() {
        for (String invalid : new String[]{"", "short", "a".repeat(73), "한".repeat(25)}) {
            assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, invalid).run(null));
        }
        verifyNoInteractions(members);
    }

    @Test void doesNotAdoptAccountWithPersonalPhoneOrBirth() {
        for (Member member : new Member[]{
                new Member("ttalkak_review", encoder.encode(password), "existing", "TTALKAK 심사 계정", null, "01000000000", null),
                new Member("ttalkak_review", encoder.encode(password), "existing", "TTALKAK 심사 계정", java.time.LocalDate.of(2000, 1, 1), null, null)}) {
            when(members.findByUserId("ttalkak_review")).thenReturn(Optional.of(member));
            assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, password).run(null));
        }
        verify(members, never()).save(any());
    }

    @Test void doesNotResetPasswordOfAnExistingOrdinaryMember() {
        Member member = new Member("ttalkak_review", encoder.encode("other-password-123!"), "existing", "TTALKAK 심사 계정", null, null, null);
        when(members.findByUserId("ttalkak_review")).thenReturn(Optional.of(member));
        assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, password).run(null));
        assertThat(encoder.matches("other-password-123!", member.getPassword())).isTrue();
        verify(members, never()).save(any());
    }

    @Test void concurrentUniqueKeyConflictDoesNotStopStartupOrModifyOtherMembers() {
        when(members.findByUserId("ttalkak_review")).thenReturn(Optional.empty());
        when(members.save(any())).thenThrow(new DataIntegrityViolationException("fixture duplicate"));
        assertDoesNotThrow(() -> new MerchantReviewAccountInitializer(members, encoder, true, password).run(null));
        verify(members, times(1)).save(any());
        verify(members, never()).delete(any());
    }
}
