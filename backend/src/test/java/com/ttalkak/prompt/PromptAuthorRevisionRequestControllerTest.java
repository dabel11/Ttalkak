package com.ttalkak.prompt;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PromptAuthorRevisionRequestControllerTest {

    private static final String AUTHORIZATION =
            "Bearer test-token";

    private PromptAuthorRevisionRequestRepository
            requestRepository;

    private PromptRepository promptRepository;
    private AuthService authService;
    private AdminAuditLogRepository adminAuditLogRepository;

    private PromptAuthorRevisionRequestController controller;

    @BeforeEach
    void setUp() {
        requestRepository = mock(
                PromptAuthorRevisionRequestRepository.class
        );

        promptRepository = mock(PromptRepository.class);
        authService = mock(AuthService.class);
        adminAuditLogRepository =
                mock(AdminAuditLogRepository.class);

        controller =
                new PromptAuthorRevisionRequestController(
                        requestRepository,
                        promptRepository,
                        authService,
                        adminAuditLogRepository
                );

        when(
                authService.currentMemberIdOrNull(
                        anyString()
                )
        ).thenReturn(99L);

        when(authService.currentNickname(anyString()))
                .thenReturn("admin");
    }

    @Test
    void updatesMessageWhilePending() {
        PromptAuthorRevisionRequest revisionRequest =
                revisionRequest(10L);

        when(requestRepository.findById(10L))
                .thenReturn(Optional.of(revisionRequest));

        Map<String, Object> response =
                controller.updateRequestMessage(
                        10L,
                        new PromptAuthorRevisionRequestController
                                .UpdateRequest(
                                "  updated message  "
                        ),
                        AUTHORIZATION
                );

        assertEquals(
                "updated message",
                revisionRequest.getMessage()
        );

        assertEquals(
                "updated message",
                response.get("message")
        );

        verify(requestRepository).save(revisionRequest);

        verifyAuditLog(
                "AUTHOR_REVISION_REQUEST_UPDATE",
                10L
        );
    }

    @Test
    void rejectsMessageUpdateAfterAcknowledgement() {
        PromptAuthorRevisionRequest revisionRequest =
                revisionRequest(10L);

        revisionRequest.acknowledge();

        when(requestRepository.findById(10L))
                .thenReturn(Optional.of(revisionRequest));

        ResponseStatusException exception =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.updateRequestMessage(
                                10L,
                                new PromptAuthorRevisionRequestController
                                        .UpdateRequest(
                                        "updated message"
                                ),
                                AUTHORIZATION
                        )
                );

        assertEquals(
                409,
                exception.getStatusCode().value()
        );

        assertEquals(
                "\uB300\uAE30 \uC911\uC778 "
                        + "\uC218\uC815 \uC694\uCCAD\uB9CC "
                        + "\uB0B4\uC6A9\uC744 \uC218\uC815\uD560 "
                        + "\uC218 \uC788\uC2B5\uB2C8\uB2E4.",
                exception.getReason()
        );
    }



    @Test
    void createsRequestAndWritesAuditLog() {
        PromptPost prompt = new PromptPost(
                1L,
                "author",
                "prompt title",
                "prompt text",
                "tag",
                true
        );

        ReflectionTestUtils.setField(
                prompt,
                "id",
                5L
        );

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        when(
                requestRepository.existsByPromptIdAndStatusIn(
                        5L,
                        java.util.Set.of(
                                "pending",
                                "acknowledged"
                        )
                )
        ).thenReturn(false);

        when(
                requestRepository.save(
                        org.mockito.ArgumentMatchers.any(
                                PromptAuthorRevisionRequest.class
                        )
                )
        ).thenAnswer(invocation -> {
            PromptAuthorRevisionRequest saved =
                    invocation.getArgument(0);

            ReflectionTestUtils.setField(
                    saved,
                    "id",
                    20L
            );

            return saved;
        });

        controller.createRequest(
                5L,
                new PromptAuthorRevisionRequestController
                        .CreateRequest(
                        "revision message"
                ),
                AUTHORIZATION
        );

        verifyAuditLog(
                "AUTHOR_REVISION_REQUEST_CREATE",
                20L
        );
    }

    @Test
    void returnsSpecificCodeWhenActiveRequestExists() {
        PromptPost prompt = new PromptPost(
                1L,
                "author",
                "prompt title",
                "prompt text",
                "tag",
                true
        );

        ReflectionTestUtils.setField(
                prompt,
                "id",
                5L
        );

        when(promptRepository.findById(5L))
                .thenReturn(Optional.of(prompt));

        when(
                requestRepository.existsByPromptIdAndStatusIn(
                        5L,
                        java.util.Set.of(
                                "pending",
                                "acknowledged"
                        )
                )
        ).thenReturn(true);

        ApiException exception = assertThrows(
                ApiException.class,
                () -> controller.createRequest(
                        5L,
                        new PromptAuthorRevisionRequestController
                                .CreateRequest(
                                "revision message"
                        ),
                        AUTHORIZATION
                )
        );

        assertEquals(
                409,
                exception.getStatusCode().value()
        );

        assertEquals(
                "AUTHOR_REVISION_REQUEST_ALREADY_ACTIVE",
                exception.getCode()
        );

        assertEquals(
                "이미 처리 중인 관리자 수정 요청이 있습니다.",
                exception.getReason()
        );
    }


    private void verifyAuditLog(
            String action,
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
                "admin",
                auditLog.getAdminNickname()
        );
        assertEquals(action, auditLog.getAction());
        assertEquals(
                "AUTHOR_REVISION_REQUEST",
                auditLog.getTargetType()
        );
        assertEquals(targetId, auditLog.getTargetId());
    }

    private PromptAuthorRevisionRequest revisionRequest(
            Long id
    ) {
        PromptAuthorRevisionRequest revisionRequest =
                new PromptAuthorRevisionRequest(
                        5L,
                        "prompt title",
                        1L,
                        "author",
                        99L,
                        "admin",
                        "original message"
                );

        ReflectionTestUtils.setField(
                revisionRequest,
                "id",
                id
        );

        return revisionRequest;
    }
}
