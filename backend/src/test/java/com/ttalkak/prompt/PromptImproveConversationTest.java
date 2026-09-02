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
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ArrayList;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PromptImproveConversationTest {

	private static final String AUTHORIZATION = "Bearer test-token";

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
		makeThreadRepository = mock(MakeThreadRepository.class);

		objectMapper = new ObjectMapper();

		controller = new PromptController(
				promptRepository,
				saveRepository,
				likeRepository,
				tagRepository,
				authService,
				makeThreadRepository,
				objectMapper,
				successfulRagWebClientBuilder(),
				Duration.ofSeconds(75)
		);

		ReflectionTestUtils.setField(
				controller,
				"ragServerUrl",
				"http://rag.test");

		when(
				makeThreadRepository.save(
						any(MakeThread.class)))
				.thenAnswer(invocation -> {
					MakeThread thread = invocation.getArgument(0);

					if (thread.getId() == null) {
						ReflectionTestUtils.setField(
								thread,
								"id",
								101L);
					}

					return thread;
				});
	}

	@Test
	void anonymousImproveDoesNotSaveThread() {
		when(
				authService.currentMemberIdOrNull(null)).thenReturn(null);

		Map<String, Object> response = controller.improve(
				request(
						"운동 계획을 만들어줘",
						null,
						null),
				null);

		assertNull(response.get("conversationId"));
		assertNull(response.get("threadId"));
		assertEquals(
				"ok",
				response.get("ragStatus"));

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}

	@Test
	void loggedInFirstImproveCreatesThread()
			throws Exception {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION))
				.thenReturn(7L);

		Map<String, Object> response = controller.improve(
				request(
						"운동 계획을 만들어줘",
						null,
						null),
				AUTHORIZATION);

		assertEquals(
				101L,
				response.get("conversationId"));

		assertEquals(
				101L,
				response.get("threadId"));

		ArgumentCaptor<MakeThread> captor = ArgumentCaptor.forClass(
				MakeThread.class);

		verify(makeThreadRepository)
				.save(captor.capture());

		MakeThread savedThread = captor.getValue();

		assertEquals(
				7L,
				savedThread.getMemberId());

		List<Map<String, Object>> messages = readMessages(savedThread);

		assertEquals(2, messages.size());
		assertEquals(
				"user",
				messages.get(0).get("role"));
		assertEquals(
				"assistant",
				messages.get(1).get("role"));
	}

	@Test
	void loggedInFollowUpAppendsMessages()
			throws Exception {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION))
				.thenReturn(7L);

		String originalMessages = objectMapper.writeValueAsString(
				List.of(
						Map.of(
								"role",
								"user",
								"content",
								"첫 번째 요청"),
						Map.of(
								"role",
								"assistant",
								"content",
								"첫 번째 답변")));

		MakeThread existingThread = new MakeThread(
				7L,
				"기존 대화",
				originalMessages,
				null);

		ReflectionTestUtils.setField(
				existingThread,
				"id",
				42L);

		when(
				makeThreadRepository
						.findByIdAndMemberId(
								42L,
								7L))
				.thenReturn(Optional.of(existingThread));

		Map<String, Object> response = controller.improve(
				request(
						"두 번째 요청",
						null,
						42L),
				AUTHORIZATION);

		assertEquals(
				42L,
				response.get("threadId"));

		verify(makeThreadRepository)
				.findByIdAndMemberId(
						42L,
						7L);

		verify(makeThreadRepository)
				.save(existingThread);

		List<Map<String, Object>> messages = readMessages(existingThread);

		assertEquals(4, messages.size());
		assertEquals(
				"두 번째 요청",
				messages.get(2).get("content"));
		assertEquals(
				"assistant",
				messages.get(3).get("role"));
	}

	@Test
	void repeatedRequestIdReturnsStoredResponseWithoutAppendingTurn()
			throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		String existingMessages = objectMapper.writeValueAsString(
				List.of(
						Map.of(
								"id", "user-1",
								"role", "user",
								"content", "운동 계획을 만들어줘",
								"requestId", "request-123"
						),
						Map.of(
								"id", "assistant-1",
								"role", "assistant",
								"content", "저장된 답변",
								"answer", "저장된 답변",
								"mode", "improve",
								"improvedPrompt", "저장된 개선 프롬프트",
								"sources", List.of(),
								"ragStatus", "no_evidence"
						)
				)
		);

		MakeThread existingThread = new MakeThread(
				7L,
				"기존 대화",
				existingMessages,
				null
		);

		ReflectionTestUtils.setField(
				existingThread,
				"id",
				42L
		);

		when(makeThreadRepository.findByIdAndMemberId(42L, 7L))
				.thenReturn(Optional.of(existingThread));

		Map<String, Object> response = controller.improve(
				new PromptController.ImproveRequest(
						"운동 계획을 만들어줘",
						"prompt_techniques",
						null,
						42L,
						null,
						"request-123",
						List.of()
				),
				AUTHORIZATION
		);

		assertEquals(true, response.get("replayed"));
		assertEquals(
				"저장된 개선 프롬프트",
				response.get("improvedPrompt")
		);
		assertEquals("request-123", response.get("requestId"));

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

	@Test
	void newRequestIdIsStoredWithUserMessage()
			throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		Map<String, Object> response = controller.improve(
				new PromptController.ImproveRequest(
						"운동 계획을 만들어줘",
						"prompt_techniques",
						null,
						null,
						null,
						"request-new-123",
						List.of()
				),
				AUTHORIZATION
		);

		ArgumentCaptor<MakeThread> captor =
				ArgumentCaptor.forClass(MakeThread.class);

		verify(makeThreadRepository)
				.save(captor.capture());

		List<Map<String, Object>> messages =
				readMessages(captor.getValue());

		assertEquals(2, messages.size());
		assertEquals(
				"request-new-123",
				messages.get(0).get("requestId")
		);
		assertEquals(
				"request-new-123",
				response.get("requestId")
		);
		assertEquals(false, response.get("replayed"));
		assertEquals(
				"request-new-123",
				captor.getValue().getInitialRequestId()
		);
	}

	@Test
	void repeatedInitialRequestIdReplaysTheCreatedThreadWithoutThreadId()
			throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		PromptController.ImproveRequest request =
				new PromptController.ImproveRequest(
						"첫 요청 응답 유실 복구",
						"prompt_techniques",
						null,
						null,
						null,
						"initial-request-123",
						List.of()
				);

		Map<String, Object> first = controller.improve(request, AUTHORIZATION);
		ArgumentCaptor<MakeThread> captor = ArgumentCaptor.forClass(MakeThread.class);
		verify(makeThreadRepository).save(captor.capture());
		MakeThread created = captor.getValue();

		when(makeThreadRepository.findByMemberIdAndInitialRequestId(
				7L,
				"initial-request-123"
		)).thenReturn(Optional.of(created));

		Map<String, Object> replay = controller.improve(request, AUTHORIZATION);

		assertEquals(first.get("threadId"), replay.get("threadId"));
		assertEquals(true, replay.get("replayed"));
		assertEquals("initial-request-123", replay.get("requestId"));
		verify(makeThreadRepository, times(1)).save(any(MakeThread.class));
	}

	@Test
	void reusedRequestIdWithDifferentPromptIsRejected()
			throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		String existingMessages = objectMapper.writeValueAsString(
				List.of(
						Map.of(
								"id", "user-1",
								"role", "user",
								"content", "원래 요청",
								"requestId", "request-123"
						),
						Map.of(
								"id", "assistant-1",
								"role", "assistant",
								"content", "원래 답변"
						)
				)
		);

		MakeThread existingThread = new MakeThread(
				7L,
				"기존 대화",
				existingMessages,
				null
		);

		ReflectionTestUtils.setField(
				existingThread,
				"id",
				42L
		);

		when(makeThreadRepository.findByIdAndMemberId(42L, 7L))
				.thenReturn(Optional.of(existingThread));

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						new PromptController.ImproveRequest(
								"다른 요청",
								"prompt_techniques",
								null,
								42L,
								null,
								"request-123",
								List.of()
						),
						AUTHORIZATION
				)
		);

		assertEquals(
				409,
				exception.getStatusCode().value()
		);
		assertEquals(
				"REQUEST_ID_REUSED",
				exception.getCode()
		);

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

	@Test
	void rejectsRequestIdLongerThan128Characters() {
		when(authService.currentMemberIdOrNull(null))
				.thenReturn(null);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						new PromptController.ImproveRequest(
								"운동 계획을 만들어줘",
								"prompt_techniques",
								null,
								null,
								null,
								"x".repeat(129),
								List.of()
						),
						null
				)
		);

		assertEquals(
				400,
				exception.getStatusCode().value()
		);
		assertEquals(
				"REQUEST_ID_INVALID",
				exception.getCode()
		);

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

	@Test
	void anonymousUserCannotContinueSavedThread() {
		when(
				authService.currentMemberIdOrNull(null)).thenReturn(null);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request(
								"이어서 개선해줘",
								null,
								42L),
						null));

		assertEquals(
				401,
				exception.getStatusCode().value());

		assertEquals(
				"LOGIN_REQUIRED",
				exception.getCode());
	}

	@Test
	void cannotAccessAnotherUsersThread() {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION))
				.thenReturn(7L);

		when(
				makeThreadRepository
						.findByIdAndMemberId(
								42L,
								7L))
				.thenReturn(Optional.empty());

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request(
								"이어서 개선해줘",
								null,
								42L),
						AUTHORIZATION));

		assertEquals(
				404,
				exception.getStatusCode().value());

		assertEquals(
				"THREAD_NOT_FOUND",
				exception.getCode());
	}

	@Test
	void conversationIdCanContinueExistingThread() throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		String originalMessages = objectMapper.writeValueAsString(
				List.of(
						Map.of(
								"role", "user",
								"content", "첫 번째 요청"),
						Map.of(
								"role", "assistant",
								"content", "첫 번째 답변")));

		MakeThread existingThread = new MakeThread(
				7L,
				"기존 대화",
				originalMessages,
				null);

		ReflectionTestUtils.setField(existingThread, "id", 42L);

		when(makeThreadRepository.findByIdAndMemberId(42L, 7L))
				.thenReturn(Optional.of(existingThread));

		PromptController.ImproveRequest request =
				new PromptController.ImproveRequest(
						"conversationId로 이어가기",
						"prompt_techniques",
						42L,
						null,
						null,
						List.of()
				);

		Map<String, Object> response = controller.improve(request, AUTHORIZATION);

		assertEquals(42L, response.get("conversationId"));
		assertEquals(42L, response.get("threadId"));

		verify(makeThreadRepository)
				.findByIdAndMemberId(42L, 7L);
	}

	private void useRagResponse(
			HttpStatus status,
			String responseBody) {
		WebClient.Builder webClientBuilder = WebClient.builder()
				.exchangeFunction(request -> Mono.just(
						ClientResponse
								.create(status)
								.header(
										HttpHeaders.CONTENT_TYPE,
										MediaType.APPLICATION_JSON_VALUE)
								.body(responseBody)
								.build()));

		controller = new PromptController(
				promptRepository,
				saveRepository,
				likeRepository,
				tagRepository,
				authService,
				makeThreadRepository,
				objectMapper,
				webClientBuilder,
				Duration.ofSeconds(75)
		);

		ReflectionTestUtils.setField(
				controller,
				"ragServerUrl",
				"http://rag.test");
	}

	private void useNeverRespondingRag(Duration timeout) {
			WebClient.Builder webClientBuilder = WebClient.builder()
					.exchangeFunction(request -> Mono.never());

			controller = new PromptController(
					promptRepository,
					saveRepository,
					likeRepository,
					tagRepository,
					authService,
					makeThreadRepository,
					objectMapper,
					webClientBuilder,
					timeout
			);

			ReflectionTestUtils.setField(
					controller,
					"ragServerUrl",
					"http://rag.test");
	}

	private WebClient.Builder successfulRagWebClientBuilder() {
		String responseBody = """
				{
				"answer": "프롬프트를 개선했습니다.",
				"improvedPrompt": "개선된 테스트 프롬프트",
				"sources": [
					{
					"title": "테스트 근거"
					}
				],
				"ragStatus": "ok",
				"techniquesApplied": [
					"Role Prompting"
				],
				"changes": [
					"역할을 명확하게 지정"
				]
				}
				""";

		return WebClient.builder()
				.exchangeFunction(request -> Mono.just(
						ClientResponse
								.create(HttpStatus.OK)
								.header(
										HttpHeaders.CONTENT_TYPE,
										MediaType.APPLICATION_JSON_VALUE)
								.body(responseBody)
								.build()));
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
						null,
						List.of()
				);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(request, AUTHORIZATION));

		assertEquals(400, exception.getStatusCode().value());
		assertEquals("THREAD_ID_MISMATCH", exception.getCode());

		verify(makeThreadRepository, never())
				.findByIdAndMemberId(any(), any());

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

	@Test
	void rejectsCorruptedStoredThreadWithoutOverwritingIt() {
		when(authService.currentMemberIdOrNull(AUTHORIZATION))
				.thenReturn(7L);

		MakeThread corruptedThread = new MakeThread(
				7L,
				"손상된 대화",
				"{not-valid-json",
				null);

		ReflectionTestUtils.setField(
				corruptedThread,
				"id",
				42L);

		when(makeThreadRepository.findByIdAndMemberId(42L, 7L))
				.thenReturn(Optional.of(corruptedThread));

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request("이어서 개선해줘", null, 42L),
						AUTHORIZATION));

		assertEquals(
				500,
				exception.getStatusCode().value());
		assertEquals(
				"THREAD_DATA_CORRUPTED",
				exception.getCode());

		verify(makeThreadRepository, never())
				.save(any(MakeThread.class));
	}

	@Test
	void rejectsBlankPrompt() {
		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request(
								"   ",
								null,
								null),
						null));

		assertEquals(
				400,
				exception.getStatusCode().value());

		assertEquals(
				"PROMPT_REQUIRED",
				exception.getCode());

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}

	@Test
	void ragNotFoundReturnsNoEvidence() {
		when(
				authService.currentMemberIdOrNull(null)).thenReturn(null);

		useRagResponse(
				HttpStatus.NOT_FOUND,
				"""
						{
						  "detail": "관련 근거를 찾지 못했습니다."
						}
						""");

		Map response = controller.improve(
				request(
						"자기소개서 프롬프트를 만들어줘",
						null,
						null),
				null);

		assertEquals(
				"no_evidence",
				response.get("ragStatus"));
		assertEquals(
				"자기소개서 프롬프트를 만들어줘",
				response.get("improvedPrompt"));
		assertEquals(
				List.of(),
				response.get("sources"));

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}


	@Test
	void askResponseWithoutAnswerStillReturnsQuestions() {
		when(
				authService.currentMemberIdOrNull(null)).thenReturn(null);

		useRagResponse(
				HttpStatus.OK,
				"""
						{
						  "mode": "ask",
						  "summary": "주제 정보가 필요합니다.",
						  "questions": [
						    {
						      "field": "topic",
						      "question": "어떤 주제로 작성할까요?",
						      "reason": "방향을 정하기 위해 필요합니다.",
						      "importance": "required"
						    }
						  ],
						  "ragStatus": "ok"
						}
						""");

		Map<String, Object> response = controller.improve(
				request(
						"글 써줘",
						null,
						null),
				null);

		assertEquals("ask", response.get("mode"));
		assertEquals("", response.get("improvedPrompt"));
		assertEquals("주제 정보가 필요합니다.", response.get("answer"));
		assertEquals("주제 정보가 필요합니다.", response.get("summary"));
		assertEquals(
				1,
				((List<?>) response.get("questions")).size());

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}

	@Test
	void questionAliasResponseIsTreatedAsAsk() {
		when(
				authService.currentMemberIdOrNull(null)).thenReturn(null);

		useRagResponse(
				HttpStatus.OK,
				"""
						{
						  "type": "question",
						  "answer": "추가 확인이 필요합니다.",
						  "questions": ["대상 독자는 누구인가요?"],
						  "improved_prompt": "실행되면 안 되는 프롬프트",
						  "ragStatus": "ok"
						}
						""");

		Map<String, Object> response = controller.improve(
				request(
						"좋은 글 써줘",
						null,
						null),
				null);

		assertEquals("ask", response.get("mode"));
		assertEquals("", response.get("improvedPrompt"));
		assertEquals(
				1,
				((List<?>) response.get("questions")).size());
	}

	@Test
	void askResponseWithoutQuestionsGetsSafeFallbackQuestion() {
		when(authService.currentMemberIdOrNull(null)).thenReturn(null);

		useRagResponse(
				HttpStatus.OK,
				"""
						{
						  "mode": "ask",
						  "summary": "추가 정보가 필요합니다.",
						  "ragStatus": "ok"
						}
						""");

		Map<String, Object> response = controller.improve(
				request("글을 써줘", null, null),
				null);

		assertEquals("ask", response.get("mode"));
		assertEquals("", response.get("improvedPrompt"));
		List<?> questions = (List<?>) response.get("questions");
		assertEquals(1, questions.size());
		assertEquals(
				"details",
				((Map<?, ?>) questions.get(0)).get("field"));
	}

	@Test
	void loggedInAskTurnIsPersistedForFollowUpAndReload() throws Exception {
		when(authService.currentMemberIdOrNull(AUTHORIZATION)).thenReturn(7L);
		useRagResponse(
				HttpStatus.OK,
				"""
						{
						  "mode": "ask",
						  "summary": "대상 독자를 알려주세요.",
						  "questions": ["대상 독자는 누구인가요?"],
						  "ragStatus": "ok"
						}
						""");

		Map<String, Object> response = controller.improve(
				request("온보딩 글을 써줘", null, null),
				AUTHORIZATION);

		ArgumentCaptor<MakeThread> captor = ArgumentCaptor.forClass(MakeThread.class);
		verify(makeThreadRepository).save(captor.capture());
		MakeThread savedThread = captor.getValue();
		List<Map<String, Object>> messages = readMessages(savedThread);

		assertEquals(101L, response.get("threadId"));
		assertEquals(2, messages.size());
		assertEquals("user", messages.get(0).get("role"));
		assertEquals("assistant", messages.get(1).get("role"));
		assertEquals("대상 독자를 알려주세요.", messages.get(1).get("content"));
		assertEquals("ask", messages.get(1).get("mode"));
		assertEquals(1, ((List<?>) messages.get(1).get("questions")).size());
	}

	@Test
	void ragServiceUnavailableDoesNotSaveThread() {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION))
				.thenReturn(7L);

		useRagResponse(
				HttpStatus.SERVICE_UNAVAILABLE,
				"""
						{
						  "detail": "RAG 서버를 사용할 수 없습니다."
						}
						""");

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request(
								"프롬프트를 개선해줘",
								null,
								null),
						AUTHORIZATION));

		assertEquals(
				503,
				exception.getStatusCode().value());
		assertEquals(
				"AI_SERVICE_UNAVAILABLE",
				exception.getCode());

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}

	@Test
	void ragTimeoutReturnsServiceUnavailableAndDoesNotSaveThread() {
			when(
					authService.currentMemberIdOrNull(AUTHORIZATION))
					.thenReturn(7L);

			useNeverRespondingRag(Duration.ofMillis(100));

			ApiException exception = assertThrows(
					ApiException.class,
					() -> controller.improve(
							request(
									"프롬프트를 개선해줘",
									null,
									null),
							AUTHORIZATION));

			assertEquals(
					503,
					exception.getStatusCode().value());
			assertEquals(
					"AI_SERVICE_UNAVAILABLE",
					exception.getCode());

			verify(
					makeThreadRepository,
					never()).save(any(MakeThread.class));
	}

	@Test
	void ragQuotaExceededDoesNotSaveThread() {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION))
				.thenReturn(7L);

		useRagResponse(
				HttpStatus.SERVICE_UNAVAILABLE,
				"""
						{
						  "detail": "Gemini 일일 한도 초과"
						}
						""");

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						request(
								"프롬프트를 개선해줘",
								null,
								null),
						AUTHORIZATION));

		assertEquals(
				503,
				exception.getStatusCode().value());
		assertEquals(
				"AI_RATE_LIMIT_EXCEEDED",
				exception.getCode());

		verify(
				makeThreadRepository,
				never()).save(any(MakeThread.class));
	}

	@Test
	void editsUserMessageAndDeletesFollowingMessages()
			throws Exception {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION
				)
		).thenReturn(7L);

		List<Map<String, Object>> storedMessages =
				new ArrayList<>(List.of(
						Map.of(
								"id", "user-1",
								"role", "user",
								"content", "첫 질문",
								"createdAt", "2026-07-22T10:00:00"
						),
						Map.of(
								"id", "assistant-1",
								"role", "assistant",
								"content", "첫 답변",
								"createdAt", "2026-07-22T10:00:01"
						),
						Map.of(
								"id", "user-2",
								"role", "user",
								"content", "수정 전 질문",
								"requestId", "old-request-id",
								"createdAt", "2026-07-22T10:00:02"
						),
						Map.of(
								"id", "assistant-2",
								"role", "assistant",
								"content", "삭제될 답변",
								"createdAt", "2026-07-22T10:00:03"
						),
						Map.of(
								"id", "user-3",
								"role", "user",
								"content", "삭제될 후속 질문",
								"createdAt", "2026-07-22T10:00:04"
						)
				));

		MakeThread thread = new MakeThread(
				7L,
				"테스트 대화",
				objectMapper.writeValueAsString(
						storedMessages
				),
				null
		);

		ReflectionTestUtils.setField(
				thread,
				"id",
				42L
		);

		when(
				makeThreadRepository.findByIdAndMemberId(
						42L,
						7L
				)
		).thenReturn(Optional.of(thread));

		Map<String, Object> response =
				controller.improve(
						editRequest(
								"수정된 질문",
								42L,
								"user-2"
						),
						AUTHORIZATION
				);

		assertEquals(42L, response.get("threadId"));
		assertEquals(
				"user-2",
				response.get("editedMessageId")
		);

		List<Map<String, Object>> savedMessages =
				readMessages(thread);

		assertEquals(4, savedMessages.size());

		assertEquals(
				"user-1",
				savedMessages.get(0).get("id")
		);
		assertEquals(
				"assistant-1",
				savedMessages.get(1).get("id")
		);

		assertEquals(
				"user-2",
				savedMessages.get(2).get("id")
		);
		assertEquals(
				"수정된 질문",
				savedMessages.get(2).get("content")
		);
		assertNotNull(
				savedMessages.get(2).get("editedAt")
		);
        assertNull(
                savedMessages.get(2).get("requestId")
        );

		assertEquals(
				"assistant",
				savedMessages.get(3).get("role")
		);
		assertEquals(
				"프롬프트를 개선했습니다.",
				savedMessages.get(3).get("content")
		);

		assertTrue(
				savedMessages.stream().noneMatch(
						message ->
								"assistant-2".equals(
										message.get("id")
								)
										|| "user-3".equals(
										message.get("id")
								)
				)
		);

		verify(makeThreadRepository)
				.save(thread);
	}

	@Test
	void rejectsEditingAssistantMessage()
			throws Exception {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION
				)
		).thenReturn(7L);

		List<Map<String, Object>> storedMessages =
				List.of(
						Map.of(
								"id", "user-1",
								"role", "user",
								"content", "질문"
						),
						Map.of(
								"id", "assistant-1",
								"role", "assistant",
								"content", "답변"
						)
				);

		MakeThread thread = new MakeThread(
				7L,
				"테스트 대화",
				objectMapper.writeValueAsString(
						storedMessages
				),
				null
		);

		ReflectionTestUtils.setField(
				thread,
				"id",
				42L
		);

		when(
				makeThreadRepository.findByIdAndMemberId(
						42L,
						7L
				)
		).thenReturn(Optional.of(thread));

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						editRequest(
								"답변을 수정",
								42L,
								"assistant-1"
						),
						AUTHORIZATION
				)
		);

		assertEquals(
				"MESSAGE_NOT_EDITABLE",
				exception.getCode()
		);

		verify(
				makeThreadRepository,
				never()
		).save(any(MakeThread.class));
	}

	@Test
	void rejectsUnknownMessageId()
			throws Exception {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION
				)
		).thenReturn(7L);

		MakeThread thread = new MakeThread(
				7L,
				"테스트 대화",
				objectMapper.writeValueAsString(
						List.of(
								Map.of(
										"id", "user-1",
										"role", "user",
										"content", "질문"
								)
						)
				),
				null
		);

		ReflectionTestUtils.setField(
				thread,
				"id",
				42L
		);

		when(
				makeThreadRepository.findByIdAndMemberId(
						42L,
						7L
				)
		).thenReturn(Optional.of(thread));

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						editRequest(
								"수정된 질문",
								42L,
								"user-missing"
						),
						AUTHORIZATION
				)
		);

		assertEquals(
				"MESSAGE_NOT_FOUND",
				exception.getCode()
		);

		verify(
				makeThreadRepository,
				never()
		).save(any(MakeThread.class));
	}

	@Test
	void editingMessageRequiresThreadId() {
		when(
				authService.currentMemberIdOrNull(
						AUTHORIZATION
				)
		).thenReturn(7L);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						editRequest(
								"수정된 질문",
								null,
								"user-1"
						),
						AUTHORIZATION
				)
		);

		assertEquals(
				"THREAD_ID_REQUIRED",
				exception.getCode()
		);

		verify(
				makeThreadRepository,
				never()
		).findByIdAndMemberId(any(), any());
	}

	@Test
	void anonymousUserCannotEditServerMessage() {
		when(
				authService.currentMemberIdOrNull(null)
		).thenReturn(null);

		ApiException exception = assertThrows(
				ApiException.class,
				() -> controller.improve(
						editRequest(
								"수정된 질문",
								42L,
								"user-1"
						),
						null
				)
		);

		assertEquals(401, exception.getStatusCode().value());
		assertEquals(
				"LOGIN_REQUIRED",
				exception.getCode()
		);

		verify(
				makeThreadRepository,
				never()
		).findByIdAndMemberId(any(), any());
	}

	private PromptController.ImproveRequest editRequest(
			String prompt,
			Long threadId,
			String messageId
	) {
		return new PromptController.ImproveRequest(
				prompt,
				"prompt_techniques",
				null,
				threadId,
				messageId,
				List.of()
		);
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
				null,
				List.of()
		);
	}

	private List<Map<String, Object>> readMessages(
			MakeThread thread) throws Exception {
		return objectMapper.readValue(
				thread.getMessagesJson(),
				new TypeReference<List<Map<String, Object>>>() {
				});
	}
}
