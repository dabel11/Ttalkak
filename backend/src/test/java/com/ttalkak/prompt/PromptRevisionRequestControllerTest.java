package com.ttalkak.prompt;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PromptRevisionRequestControllerTest {

    private static final String AUTHORIZATION =
        "Bearer test-token";

    private PromptRevisionRequestRepository revisionRequestRepository;
    private PromptRepository promptRepository;
    private AuthService authService;
    private AdminAuditLogRepository adminAuditLogRepository;
    private PromptRevisionRequestController controller;

    @BeforeEach
    void setUp() {
        revisionRequestRepository =
            mock(PromptRevisionRequestRepository.class);
        promptRepository =
            mock(PromptRepository.class);
        authService =
            mock(AuthService.class);
        adminAuditLogRepository =
            mock(AdminAuditLogRepository.class);

        controller = new PromptRevisionRequestController(
            revisionRequestRepository,
            promptRepository,
            authService,
            adminAuditLogRepository
        );

        when(
            authService.currentMemberIdOrNull(anyString())
        ).thenReturn(99L);

        when(
            authService.currentNickname(anyString())
        ).thenReturn("admin");
    }

    @Test
    void approvesRevisionRequestAndWritesAuditLog() {
        PromptRevisionRequest revision =
            revisionRequest(10L);

        PromptPost prompt = new PromptPost(
            1L,
            "author",
            "기존 제목",
            "기존 본문",
            "기존태그",
            true
        );

        ReflectionTestUtils.setField(
            prompt,
            "id",
            5L
        );

        when(
            revisionRequestRepository.findById(10L)
        ).thenReturn(Optional.of(revision));

        when(
            promptRepository.findById(5L)
        ).thenReturn(Optional.of(prompt));

        controller.reviewRevisionRequest(
            10L,
            new PromptRevisionRequestController
                .RevisionStatusRequest(
                    "approved",
                    "승인합니다."
                ),
            AUTHORIZATION
        );

        assertEquals(
            "approved",
            revision.getStatus()
        );
        assertEquals(
            99L,
            revision.getReviewedBy()
        );
        assertEquals(
            "수정 제목",
            prompt.getTitle()
        );
        assertEquals(
            "수정 본문",
            prompt.getText()
        );

        verify(promptRepository).save(prompt);
        verify(revisionRequestRepository)
            .save(revision);

        verifyAuditLog(
            10L,
            "pending",
            "approved",
            "승인합니다."
        );
    }

    @Test
    void rejectsRevisionRequestAndWritesAuditLog() {
        PromptRevisionRequest revision =
            revisionRequest(11L);

        when(
            revisionRequestRepository.findById(11L)
        ).thenReturn(Optional.of(revision));

        when(
            promptRepository.findById(5L)
        ).thenReturn(Optional.empty());

        controller.reviewRevisionRequest(
            11L,
            new PromptRevisionRequestController
                .RevisionStatusRequest(
                    "rejected",
                    "수정 내용이 적절하지 않습니다."
                ),
            AUTHORIZATION
        );

        assertEquals(
            "rejected",
            revision.getStatus()
        );
        assertEquals(
            99L,
            revision.getReviewedBy()
        );

        verify(
            promptRepository,
            never()
        ).save(
            org.mockito.ArgumentMatchers
                .any(PromptPost.class)
        );

        verify(revisionRequestRepository)
            .save(revision);

        verifyAuditLog(
            11L,
            "pending",
            "rejected",
            "수정 내용이 적절하지 않습니다."
        );
    }

    private void verifyAuditLog(
        Long targetId,
        String previousStatus,
        String newStatus,
        String memo
    ) {
        ArgumentCaptor<AdminAuditLog> captor =
            ArgumentCaptor.forClass(
                AdminAuditLog.class
            );

        verify(adminAuditLogRepository)
            .save(captor.capture());

        AdminAuditLog auditLog =
            captor.getValue();

        assertEquals(
            99L,
            auditLog.getAdminId()
        );
        assertEquals(
            "admin",
            auditLog.getAdminNickname()
        );
        assertEquals(
            "REVISION_REQUEST_STATUS_CHANGE",
            auditLog.getAction()
        );
        assertEquals(
            "REVISION_REQUEST",
            auditLog.getTargetType()
        );
        assertEquals(
            targetId,
            auditLog.getTargetId()
        );

        assertTrue(
            auditLog.getDetail().contains(
                "게시물 ID: 5"
            )
        );
        assertTrue(
            auditLog.getDetail().contains(
                "게시물 제목: 기존 제목"
            )
        );
        assertTrue(
            auditLog.getDetail().contains(
                "요청자: requester"
            )
        );
        assertTrue(
            auditLog.getDetail().contains(
                "상태: "
                    + previousStatus
                    + " -> "
                    + newStatus
            )
        );
        assertTrue(
            auditLog.getDetail().contains(memo)
        );
    }

    private PromptRevisionRequest revisionRequest(
        Long id
    ) {
        PromptRevisionRequest revision =
            new PromptRevisionRequest(
                5L,
                7L,
                "requester",
                "기존 제목",
                "기존 본문",
                "기존태그",
                "수정 제목",
                "수정 본문",
                "수정태그",
                "수정 요청 사유"
            );

        ReflectionTestUtils.setField(
            revision,
            "id",
            id
        );

        return revision;
    }
}