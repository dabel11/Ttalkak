package com.ttalkak.prompt;

import com.ttalkak.auth.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

    private PromptAuthorRevisionRequestController controller;

    @BeforeEach
    void setUp() {
        requestRepository = mock(
                PromptAuthorRevisionRequestRepository.class
        );

        promptRepository = mock(PromptRepository.class);
        authService = mock(AuthService.class);

        controller =
                new PromptAuthorRevisionRequestController(
                        requestRepository,
                        promptRepository,
                        authService
                );

        when(
                authService.currentMemberIdOrNull(
                        anyString()
                )
        ).thenReturn(99L);
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
