package com.ttalkak.prompt;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.make.MakeThread;
import com.ttalkak.make.MakeThreadRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PromptImproveConversationTest {

    private static final String AUTHORIZATION =
            "Bearer test-token";

    private PromptRepository promptRepository;
    private PromptSaveRepository saveRepository;
    private PromptLikeRepository likeRepository;
    private TagRepository tagRepository;
    private AuthService authService;
    private MakeThreadRepository makeThreadRepository;

    private ObjectMapper objectMapper;
    private PromptController controller;

    @BeforeEach
    void setUp() {
        promptRepository = mock(PromptRepository.class);
        saveRepository = mock(PromptSaveRepository.class);
        likeRepository = mock(PromptLikeRepository.class);
        tagRepository = mock(TagRepository.class);
        authService = mock(AuthService.class);
        makeThreadRepository =
                mock(MakeThreadRepository.class);

        objectMapper = new ObjectMapper();

        controller = new PromptController(
                promptRepository,
                saveRepository,
                likeRepository,
                tagRepository,
                authService,
                makeThreadRepository,
                objectMapper,
                WebClient.builder()
        );

        ReflectionTestUtils.setField(
                controller,
                "ragServerUrl",
                "http://127.0.0.1:1"
        );

        when(
                makeThreadRepository.save(
                        any(MakeThread.class)
                )
        ).thenAnswer(invocation -> {
            MakeThread thread =
                    invocation.getArgument(0);

            if (thread.getId() == null) {
                ReflectionTestUtils.setField(
                        thread,
                        "id",
                        101L
                );
            }

            return thread;
        });
    }

    @Test
    void anonymousImproveDoesNotSaveThread() {
        when(
                authService.currentMemberIdOrNull(null)
        ).thenReturn(null);

        Map<String, Object> response =
                controller.improve(
                        request(
                                "운동 계획을 만들어줘",
                                null,
                                null
                        ),
                        null
                );

        assertNull(response.get("conversationId"));
        assertNull(response.get("threadId"));
        assertEquals(
                "fallback",
                response.get("ragStatus")
        );

        verify(
                makeThreadRepository,
                never()
        ).save(any(MakeThread.class));
    }

    @Test
    void loggedInFirstImproveCreatesThread()
            throws Exception {
        when(
                authService.currentMemberIdOrNull(
                        AUTHORIZATION
                )
        ).thenReturn(7L);

        Map<String, Object> response =
                controller.improve(
                        request(
                                "운동 계획을 만들어줘",
                                null,
                                null
                        ),
                        AUTHORIZATION
                );

        assertEquals(
                101L,
                response.get("conversationId")
        );

        assertEquals(
                101L,
                response.get("threadId")
        );

        ArgumentCaptor<MakeThread> captor =
                ArgumentCaptor.forClass(
                        MakeThread.class
                );

        verify(makeThreadRepository)
                .save(captor.capture());

        MakeThread savedThread =
                captor.getValue();

        assertEquals(
                7L,
                savedThread.getMemberId()
        );

        List<Map<String, Object>> messages =
                readMessages(savedThread);

        assertEquals(2, messages.size());
        assertEquals(
                "user",
                messages.get(0).get("role")
        );
        assertEquals(
                "assistant",
                messages.get(1).get("role")
        );
    }

    @Test
    void loggedInFollowUpAppendsMessages()
            throws Exception {
        when(
                authService.currentMemberIdOrNull(
                        AUTHORIZATION
                )
        ).thenReturn(7L);

        String originalMessages =
                objectMapper.writeValueAsString(
                        List.of(
                                Map.of(
                                        "role",
                                        "user",
                                        "content",
                                        "첫 번째 요청"
                                ),
                                Map.of(
                                        "role",
                                        "assistant",
                                        "content",
                                        "첫 번째 답변"
                                )
                        )
                );

        MakeThread existingThread =
                new MakeThread(
                        7L,
                        "기존 대화",
                        originalMessages,
                        null
                );

        ReflectionTestUtils.setField(
                existingThread,
                "id",
                42L
        );

        when(
                makeThreadRepository
                        .findByIdAndMemberId(
                                42L,
                                7L
                        )
        ).thenReturn(Optional.of(existingThread));

        Map<String, Object> response =
                controller.improve(
                        request(
                                "두 번째 요청",
                                null,
                                42L
                        ),
                        AUTHORIZATION
                );

        assertEquals(
                42L,
                response.get("threadId")
        );

        verify(makeThreadRepository)
                .findByIdAndMemberId(
                        42L,
                        7L
                );

        verify(makeThreadRepository)
                .save(existingThread);

        List<Map<String, Object>> messages =
                readMessages(existingThread);

        assertEquals(4, messages.size());
        assertEquals(
                "두 번째 요청",
                messages.get(2).get("content")
        );
        assertEquals(
                "assistant",
                messages.get(3).get("role")
        );
    }

    @Test
    void anonymousUserCannotContinueSavedThread() {
        when(
                authService.currentMemberIdOrNull(null)
        ).thenReturn(null);

        ApiException exception =
                assertThrows(
                        ApiException.class,
                        () -> controller.improve(
                                request(
                                        "이어서 개선해줘",
                                        null,
                                        42L
                                ),
                                null
                        )
                );

        assertEquals(
                401,
                exception.getStatusCode().value()
        );

        assertEquals(
                "LOGIN_REQUIRED",
                exception.getCode()
        );
    }

    @Test
    void cannotAccessAnotherUsersThread() {
        when(
                authService.currentMemberIdOrNull(
                        AUTHORIZATION
                )
        ).thenReturn(7L);

        when(
                makeThreadRepository
                        .findByIdAndMemberId(
                                42L,
                                7L
                        )
        ).thenReturn(Optional.empty());

        ApiException exception =
                assertThrows(
                        ApiException.class,
                        () -> controller.improve(
                                request(
                                        "이어서 개선해줘",
                                        null,
                                        42L
                                ),
                                AUTHORIZATION
                        )
                );

        assertEquals(
                404,
                exception.getStatusCode().value()
        );

        assertEquals(
                "THREAD_NOT_FOUND",
                exception.getCode()
        );
    }

	@Test
	void conversationIdCanContinueExistingThread() throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		String originalMessages = objectMapper.writeValueAsString(
				List.of(
						Map.of(
								"role", "user",
								"content", "첫 번째 요청"
						),
						Map.of(
								"role", "assistant",
								"content", "첫 번째 답변"
						)
				)
		);

		MakeThread existingThread = new MakeThread(
				7L,
				"기존 대화",
				originalMessages,
				null
		);

		ReflectionTestUtils.setField(existingThread, "id", 42L);

		when(makeThreadRepository.findByIdAndMemberId(42L, 7L))
				.thenReturn(Optional.of(existingThread));

		PromptController.ImproveRequest request =
				new PromptController.ImproveRequest(
						"conversationId로 이어가기",
						"prompt_techniques",
						42L,
						null,
						List.of()
				);

		Map<String, Object> response =
				controller.improve(request, AUTHORIZATION);

		assertEquals(42L, response.get("conversationId"));
		assertEquals(42L, response.get("threadId"));

		verify(makeThreadRepository)
				.findByIdAndMemberId(42L, 7L);
	}

	@Test
	void rejectsDifferentConversationIdAndThreadId() {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		PromptController.ImproveRequest request =
				new PromptController.ImproveRequest(
						"이어지는 요청",
						"prompt_techniques",
						41L,
						42L,
						List.of()
				);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(request, AUTHORIZATION)
		);

		assertEquals(400, exception.getStatusCode().value());
		assertEquals("THREAD_ID_MISMATCH", exception.getCode());

		verify(makeThreadRepository, never())
				.findByIdAndMemberId(any(), any());

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

    @Test
    void rejectsBlankPrompt() {
        ApiException exception =
                assertThrows(
                        ApiException.class,
                        () -> controller.improve(
                                request(
                                        "   ",
                                        null,
                                        null
                                ),
                                null
                        )
                );

        assertEquals(
                400,
                exception.getStatusCode().value()
        );

        assertEquals(
                "PROMPT_REQUIRED",
                exception.getCode()
        );

        verify(
                makeThreadRepository,
                never()
        ).save(any(MakeThread.class));
    }

    private PromptController.ImproveRequest request(
            String prompt,
            Long conversationId,
            Long threadId
    ) {
        return new PromptController.ImproveRequest(
                prompt,
                "prompt_techniques",
                conversationId,
                threadId,
                List.of()
        );
    }

    private List<Map<String, Object>> readMessages(
            MakeThread thread
    ) throws Exception {
        return objectMapper.readValue(
                thread.getMessagesJson(),
                new TypeReference<
                        List<Map<String, Object>>
                        >() {
                }
        );
    }
}