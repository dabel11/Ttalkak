package com.ttalkak.auth;

import com.ttalkak.auth.GoogleIdTokenVerifier.GoogleIdentity;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.community.CommentRepository;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.make.MakeThread;
import com.ttalkak.make.MakeFolder;
import com.ttalkak.make.MakeThreadRepository;
import com.ttalkak.make.MakeFolderRepository;
import com.ttalkak.community.Comment;
import com.ttalkak.prompt.PromptPost;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

class AccountWithdrawalServiceTest {

    private MemberRepository memberRepository;
    private PasswordEncoder passwordEncoder;
    private GoogleIdTokenVerifier googleVerifier;
    private PromptRepository promptRepository;
    private CommentRepository commentRepository;
    private MakeThreadRepository makeThreadRepository;
    private MakeFolderRepository makeFolderRepository;
    private AccountWithdrawalService withdrawalService;

    @BeforeEach
    void setUp() {
        memberRepository = mock(MemberRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        googleVerifier = mock(GoogleIdTokenVerifier.class);
        promptRepository = mock(PromptRepository.class);
        commentRepository = mock(CommentRepository.class);
        makeThreadRepository = mock(MakeThreadRepository.class);
        makeFolderRepository = mock(MakeFolderRepository.class);

        withdrawalService = new AccountWithdrawalService(
                memberRepository,
                passwordEncoder,
                googleVerifier,
                promptRepository,
                commentRepository,
                makeThreadRepository,
                makeFolderRepository
        );
    }

    @Test
    void withdrawsLocalMemberWithCorrectPassword() {
        Member member = localMember();
        ReflectionTestUtils.setField(member, "birth", java.time.LocalDate.of(2000, 1, 1));

        when(passwordEncoder.matches(
                "correct-password",
                "encoded-password"
        )).thenReturn(true);

        withdrawalService.withdraw(
                member,
                "correct-password",
                null
        );

        assertFalse(member.isActive());
        assertNull(member.getBirth());
        assertNull(member.getEmail());
        assertNull(member.getPhone());
        verify(memberRepository).save(member);
    }

    @Test
    void anonymizesExistingPromptsAndCommentsWhenMemberWithdraws() {
        Member member = localMember();
        ReflectionTestUtils.setField(member, "id", 1L);

        PromptPost prompt = new PromptPost(
                1L,
                "local-nickname",
                "테스트 게시글",
                "테스트 내용",
                "test",
                true
        );

        Comment comment = new Comment(
                10L,
                null,
                1L,
                "local-nickname",
                "테스트 댓글"
        );

        when(passwordEncoder.matches(
                "correct-password",
                "encoded-password"
        )).thenReturn(true);

        when(promptRepository.findByAuthorIdOrderByUpdatedAtDesc(1L))
                .thenReturn(List.of(prompt));

        when(commentRepository.findByAuthorIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(comment));

        withdrawalService.withdraw(
                member,
                "correct-password",
                null
        );

        assertEquals(
                "탈퇴한 사용자",
                prompt.getAuthorNickname()
        );

        assertEquals(
                "탈퇴한 사용자",
                comment.getAuthorNickname()
        );

        verify(promptRepository).saveAll(List.of(prompt));
        verify(commentRepository).saveAll(List.of(comment));
    }

    @Test
    void withdrawalRemovesPrivateMakeConversationsBeforeFolderRecords() {
        Member member = localMember();
        ReflectionTestUtils.setField(member, "id", 7L);
        MakeThread thread = new MakeThread(7L, "private title",
                "[{\"role\":\"user\",\"content\":\"private text\"}]", 11L);
        MakeFolder folder = new MakeFolder(7L, "private folder");

        when(passwordEncoder.matches("correct-password", "encoded-password")).thenReturn(true);
        when(makeThreadRepository.findByMemberIdOrderByUpdatedAtDesc(7L))
                .thenReturn(List.of(thread));
        when(makeFolderRepository.findByMemberIdOrderByCreatedAtDesc(7L))
                .thenReturn(List.of(folder));

        withdrawalService.withdraw(member, "correct-password", null);

        var inOrder = org.mockito.Mockito.inOrder(makeThreadRepository, makeFolderRepository);
        inOrder.verify(makeThreadRepository).deleteAll(List.of(thread));
        inOrder.verify(makeFolderRepository).deleteAll(List.of(folder));
        assertFalse(member.isActive());
        verify(memberRepository).save(member);
    }

    @Test
    void invalidWithdrawalCannotDeleteMakeHistory() {
        Member member = localMember();
        when(passwordEncoder.matches("incorrect-password", "encoded-password")).thenReturn(false);

        assertThrows(ResponseStatusException.class,
                () -> withdrawalService.withdraw(member, "incorrect-password", null));

        verify(makeThreadRepository, never()).findByMemberIdOrderByUpdatedAtDesc(
                org.mockito.ArgumentMatchers.anyLong());
        verify(makeFolderRepository, never()).findByMemberIdOrderByCreatedAtDesc(
                org.mockito.ArgumentMatchers.anyLong());
        assertEquals(true, member.isActive());
    }

    @Test
    void rejectsLocalMemberWithoutPassword() {
        Member member = localMember();

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> withdrawalService.withdraw(
                        member,
                        null,
                        null
                )
        );

        assertEquals(
                HttpStatus.BAD_REQUEST,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsLocalMemberWithWrongPassword() {
        Member member = localMember();

        when(passwordEncoder.matches(
                "wrong-password",
                "encoded-password"
        )).thenReturn(false);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> withdrawalService.withdraw(
                        member,
                        "wrong-password",
                        null
                )
        );

        assertEquals(
                HttpStatus.FORBIDDEN,
                exception.getStatusCode()
        );
    }

    @Test
    void withdrawsGoogleMemberWithMatchingSubject() {
        Member member = googleMember();

        when(googleVerifier.verify("credential"))
                .thenReturn(new GoogleIdentity(
                        "google-subject-1",
                        "user@example.com",
                        "Google User",
                        null
                ));

        withdrawalService.withdraw(
                member,
                null,
                "credential"
        );

        assertFalse(member.isActive());
        verify(memberRepository).save(member);
    }

    @Test
    void rejectsGoogleMemberWithoutCredential() {
        Member member = googleMember();

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> withdrawalService.withdraw(
                        member,
                        null,
                        null
                )
        );

        assertEquals(
                HttpStatus.BAD_REQUEST,
                exception.getStatusCode()
        );
    }

    @Test
    void rejectsDifferentGoogleAccount() {
        Member member = googleMember();

        when(googleVerifier.verify("credential"))
                .thenReturn(new GoogleIdentity(
                        "different-google-subject",
                        "other@example.com",
                        "Other User",
                        null
                ));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> withdrawalService.withdraw(
                        member,
                        null,
                        "credential"
                )
        );

        assertEquals(
                HttpStatus.FORBIDDEN,
                exception.getStatusCode()
        );
    }

    private Member localMember() {
        return new Member(
                "local-user",
                "encoded-password",
                "local-nickname",
                "Local User",
                null,
                null,
                "local@example.com"
        );
    }

    private Member googleMember() {
        return Member.createGoogle(
                "google-user",
                "encoded-random-password",
                "google-nickname",
                "Google User",
                "user@example.com",
                "google-subject-1"
        );
    }
}
