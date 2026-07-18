package com.ttalkak.community;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CommentControllerTest {

    private static final String AUTHORIZATION = "Bearer test-token";

    private CommentRepository commentRepository;
    private CommentLikeRepository commentLikeRepository;
    private PromptRepository promptRepository;
    private AuthService authService;
    private AdminAuditLogRepository adminAuditLogRepository;
    private CommentController controller;
    private Member admin;

    @BeforeEach
    void setUp() {
        commentRepository = mock(CommentRepository.class);
        commentLikeRepository = mock(CommentLikeRepository.class);
        promptRepository = mock(PromptRepository.class);
        authService = mock(AuthService.class);
        adminAuditLogRepository =
                mock(AdminAuditLogRepository.class);

        controller = new CommentController(
                commentRepository,
                commentLikeRepository,
                promptRepository,
                authService,
                adminAuditLogRepository
        );

        admin = adminMember();

        when(authService.currentMemberIdOrNull(anyString()))
                .thenReturn(99L);

        when(authService.getMemberFromAuthorization(anyString()))
                .thenReturn(Optional.of(admin));
    }

    @Test
    void hidesCommentAndWritesAuditLog() {
        Comment comment = comment(10L);
        PromptPost prompt = prompt();
        prompt.increaseComments();

        when(commentRepository.findById(10L))
                .thenReturn(Optional.of(comment));

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        controller.hideComment(10L, AUTHORIZATION);

        assertTrue(comment.isHidden());
        assertEquals(0L, prompt.getComments());

        verifyAuditLog(
                "COMMENT_HIDE",
                "COMMENT",
                10L
        );
    }

    @Test
    void restoresCommentAndWritesAuditLog() {
        Comment comment = comment(10L);
        comment.hide();

        PromptPost prompt = prompt();

        when(commentRepository.findById(10L))
                .thenReturn(Optional.of(comment));

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        controller.unhideComment(10L, AUTHORIZATION);

        assertFalse(comment.isHidden());
        assertEquals(1L, prompt.getComments());

        verifyAuditLog(
                "COMMENT_RESTORE",
                "COMMENT",
                10L
        );
    }

    @Test
    void adminDeletesCommentAndWritesAuditLog() {
        Comment comment = comment(10L);
        PromptPost prompt = prompt();
        prompt.increaseComments();

        when(commentRepository.findById(10L))
                .thenReturn(Optional.of(comment));

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        when(commentRepository.countByParentId(10L))
                .thenReturn(0L);

        controller.adminDeleteComment(
                10L,
                AUTHORIZATION
        );

        verify(commentRepository).delete(comment);
        assertEquals(0L, prompt.getComments());

        verifyAuditLog(
                "COMMENT_DELETE",
                "COMMENT",
                10L
        );
    }

    @Test
    void duplicateHideDoesNotWriteAuditLog() {
        Comment comment = comment(10L);
        comment.hide();

        PromptPost prompt = prompt();

        when(commentRepository.findById(10L))
                .thenReturn(Optional.of(comment));

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        Map<?, ?> response = (Map<?, ?>) controller
                .hideComment(10L, AUTHORIZATION)
                .getBody();

        assertEquals(false, response.get("changed"));

        verify(adminAuditLogRepository, never())
                .save(any(AdminAuditLog.class));

        verify(commentRepository, never())
                .save(any(Comment.class));

        verify(promptRepository, never())
                .save(any(PromptPost.class));
    }

    private void verifyAuditLog(
            String action,
            String targetType,
            Long targetId
    ) {
        ArgumentCaptor<AdminAuditLog> captor =
                ArgumentCaptor.forClass(
                        AdminAuditLog.class
                );

        verify(adminAuditLogRepository)
                .save(captor.capture());

        AdminAuditLog auditLog = captor.getValue();

        assertEquals(99L, auditLog.getAdminId());
        assertEquals(
                "admin-nickname",
                auditLog.getAdminNickname()
        );
        assertEquals(action, auditLog.getAction());
        assertEquals(
                targetType,
                auditLog.getTargetType()
        );
        assertEquals(targetId, auditLog.getTargetId());
        String detail = auditLog.getDetail();

        assertTrue(detail != null);

        assertTrue(
                detail.contains("게시물 ID: 5")
        );

        assertTrue(
                detail.contains("작성자: comment-author")
        );

        assertTrue(
                detail.contains("댓글 내용: comment text")
        );
    }

    private Comment comment(Long id) {
        Comment comment = new Comment(
                5L,
                null,
                1L,
                "comment-author",
                "comment text"
        );

        ReflectionTestUtils.setField(
                comment,
                "id",
                id
        );

        return comment;
    }

    private PromptPost prompt() {
        PromptPost prompt = new PromptPost(
                1L,
                "prompt-author",
                "title",
                "text",
                "tag",
                true
        );

        ReflectionTestUtils.setField(
                prompt,
                "id",
                5L
        );

        return prompt;
    }

    private Member adminMember() {
        Member member = new Member(
                "admin-user",
                "encoded-password",
                "admin-nickname",
                "Admin User",
                null,
                "010-1111-1111",
                "admin@example.com"
        );

        ReflectionTestUtils.setField(
                member,
                "id",
                99L
        );

        ReflectionTestUtils.setField(
                member,
                "role",
                "ADMIN"
        );

        return member;
    }
}
