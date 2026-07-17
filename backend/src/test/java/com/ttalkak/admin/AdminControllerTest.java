package com.ttalkak.admin;

import com.ttalkak.community.CommentRepository;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.community.ReportResponseMapper;
import com.ttalkak.make.MakeFolderRepository;
import com.ttalkak.make.MakeThreadRepository;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.TagRepository;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class AdminControllerTest {

    private MemberRepository memberRepository;
    private AdminController controller;
    private AdminAuditLogRepository adminAuditLogRepository;

    @BeforeEach
    void setUp() {
        ReportRepository reportRepository =
                mock(ReportRepository.class);

        ReportResponseMapper reportResponseMapper =
                mock(ReportResponseMapper.class);

        PromptRepository promptRepository =
                mock(PromptRepository.class);

        TagRepository tagRepository =
                mock(TagRepository.class);

        memberRepository =
                mock(MemberRepository.class);

        CommentRepository commentRepository =
                mock(CommentRepository.class);

        MakeThreadRepository makeThreadRepository =
                mock(MakeThreadRepository.class);

        MakeFolderRepository makeFolderRepository =
                mock(MakeFolderRepository.class);

        adminAuditLogRepository =
                mock(AdminAuditLogRepository.class);

        controller = new AdminController(
                reportRepository,
                reportResponseMapper,
                promptRepository,
                tagRepository,
                memberRepository,
                commentRepository,
                makeThreadRepository,
                makeFolderRepository,
                adminAuditLogRepository
        );
    }

    @Test
    void blocksUserWithReason() {
        Member member = localMember();

        when(memberRepository.findById(1L))
                .thenReturn(Optional.of(member));

        Map<String, Object> response = controller.blockUser(
                1L,
                new AdminController.BlockUserRequest(
                        " 반복적인 이용약관 위반 "
                ),
                adminMember()
        );

        assertTrue(member.isBlocked());

        assertEquals(
                "반복적인 이용약관 위반",
                member.getBlockReason()
        );

        assertNotNull(member.getBlockedAt());

        assertEquals(
                true,
                response.get("blocked")
        );

        assertEquals(
                "반복적인 이용약관 위반",
                response.get("blockReason")
        );

        verify(memberRepository).save(member);

        ArgumentCaptor<AdminAuditLog> auditCaptor =
                ArgumentCaptor.forClass(AdminAuditLog.class);

        verify(adminAuditLogRepository)
                .save(auditCaptor.capture());

        AdminAuditLog auditLog = auditCaptor.getValue();

        assertEquals(99L, auditLog.getAdminId());
        assertEquals(
                "admin-nickname",
                auditLog.getAdminNickname()
        );
        assertEquals(
                "USER_BLOCK",
                auditLog.getAction()
        );
        assertEquals(
                "USER",
                auditLog.getTargetType()
        );
        assertEquals(1L, auditLog.getTargetId());

        assertNotNull(auditLog.getDetail());
        assertTrue(
                auditLog.getDetail()
                        .contains(member.getBlockReason())
        );
        assertNotNull(auditLog.getCreatedAt());
    }

    @Test
    void unblocksBlockedUser() {
        Member member = localMember();
        member.block("반복적인 이용약관 위반");

        when(memberRepository.findById(1L))
                .thenReturn(Optional.of(member));

        Map<String, Object> response =
            controller.unblockUser(
                    1L,
                    adminMember()
            );

        assertFalse(member.isBlocked());
        assertNull(member.getBlockReason());
        assertNull(member.getBlockedAt());

        assertEquals(
                false,
                response.get("blocked")
        );

        assertNull(response.get("blockReason"));
        assertNull(response.get("blockedAt"));

        verify(memberRepository).save(member);
        verify(adminAuditLogRepository)
        .save(any(AdminAuditLog.class));
    }

    @Test
    void returnsAuditLogsInPagedResponse() {
        AdminAuditLog auditLog = new AdminAuditLog(
                99L,
                "admin-nickname",
                "USER_BLOCK",
                "USER",
                1L,
                "차단 사유: 반복적인 이용약관 위반"
        );

        ReflectionTestUtils.setField(
                auditLog,
                "id",
                10L
        );

        when(adminAuditLogRepository
                .findAllByOrderByCreatedAtDescIdDesc())
                .thenReturn(List.of(auditLog));

        Map<String, Object> response =
                controller.auditLogs(
                        1,
                        null,
                        null
                );

        assertEquals(1, response.get("page"));
        assertEquals(1, response.get("total"));

        List<?> items =
                (List<?>) response.get("items");

        assertEquals(1, items.size());

        Map<?, ?> item =
                (Map<?, ?>) items.get(0);

        assertEquals(10L, item.get("id"));
        assertEquals(
                "USER_BLOCK",
                item.get("action")
        );
        assertEquals(
                "USER",
                item.get("targetType")
        );
        assertEquals(1L, item.get("targetId"));
        assertNotNull(item.get("admin"));
        assertNotNull(item.get("createdAt"));
    }

    private Member localMember() {
        return new Member(
                "test-user",
                "encoded-password",
                "test-nickname",
                "Test User",
                null,
                "010-0000-0000",
                "test@example.com"
        );
    }

    private Member adminMember() {
        Member admin = new Member(
                "admin-user",
                "encoded-password",
                "admin-nickname",
                "Admin User",
                null,
                "010-1111-1111",
                "admin@example.com"
        );

        ReflectionTestUtils.setField(admin, "id", 99L);
        ReflectionTestUtils.setField(admin, "role", "ADMIN");

        return admin;
    }

}