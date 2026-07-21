package com.ttalkak.prompt;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import com.ttalkak.common.exception.ApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.make.MakeThread;
import com.ttalkak.make.MakeThreadRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {
    private final PromptRepository promptRepository;
    private final PromptSaveRepository saveRepository;
    private final PromptLikeRepository likeRepository;
    private final TagRepository tagRepository;
    private final AuthService authService;
    private final WebClient webClient;
    private final MakeThreadRepository makeThreadRepository;
    private final ObjectMapper objectMapper;

    @Value("${rag.server-url:http://localhost:8000}")
    private String ragServerUrl;

    public PromptController(PromptRepository promptRepository,
                            PromptSaveRepository saveRepository,
                            PromptLikeRepository likeRepository,
                            TagRepository tagRepository,
                            AuthService authService,
                            MakeThreadRepository makeThreadRepository,
                            ObjectMapper objectMapper,
                            WebClient.Builder webClientBuilder) {
        this.promptRepository = promptRepository;
        this.saveRepository = saveRepository;
        this.likeRepository = likeRepository;
        this.tagRepository = tagRepository;
        this.authService = authService;
        this.makeThreadRepository = makeThreadRepository;
        this.objectMapper = objectMapper;
        this.webClient = webClientBuilder.build();
    }

    @GetMapping
    public Map<String, Object> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestParam(required = false) String tags,
                                    @RequestParam(required = false) String scope,
                                    @RequestParam(required = false) String query,
                                    @RequestParam(required = false) String keyword,
                                    @RequestParam(required = false) String author,
                                    @RequestParam(defaultValue = "popular") String sort,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(required = false) Integer size,
                                    @RequestParam(required = false) Integer pageSize) {
        int resolvedSize = size != null ? size : (pageSize != null ? pageSize : 16);
        Long memberId = authService.currentMemberIdOrNull(authorization);
        List<String> tagTokens = tags == null || tags.isBlank()
                ? List.of()
                : Arrays.stream(tags.split(",")).map(Tag::normalize).filter(s -> !s.isBlank()).toList();

        List<PromptPost> filtered = promptRepository.findByDeletedFalseAndSharedTrue().stream()
                .filter(prompt -> tagTokens.isEmpty() || PromptMapper.splitTags(prompt.getTagsCsv()).containsAll(tagTokens))
                .filter(prompt -> matchesSearch(prompt, scope, query, keyword, author))
                .sorted(comparator(sort))
                .toList();

        return pageResponse(filtered, page, resolvedSize, memberId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        }
        return ResponseEntity.ok(
                PromptMapper.toPromptResponse(
                        prompt,
                        memberId,
                        isSaved(id, memberId),
                        isLiked(id, memberId)
                )
        );
    }

    @PostMapping
    public ResponseEntity<?> share(@RequestBody SharePromptRequest request,
                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        String nickname = authService.currentNickname(authorization);
        String tagsCsv = PromptMapper.joinTags(request.tags());
        PromptPost prompt = new PromptPost(memberId, nickname, request.title(), request.text(), tagsCsv, true);
        promptRepository.save(prompt);
        increaseTagUsage(request.tags());
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, false, false));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                    @RequestBody SharePromptRequest request,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        if (!canManage(prompt, authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "OWNER_ONLY",
                    "작성자만 수정할 수 있습니다."
            );
        }
        prompt.update(request.title(), request.text(), PromptMapper.joinTags(request.tags()));
        promptRepository.save(prompt);
        increaseTagUsage(request.tags());
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, isSaved(id, memberId), isLiked(id, memberId)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        if (!canManage(prompt, authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "OWNER_ONLY",
                    "작성자만 삭제할 수 있습니다."
            );
        }
        prompt.delete();
        promptRepository.save(prompt);
        return ResponseEntity.ok(Map.of("deleted", true, "id", id));
    }

    @PatchMapping("/{id}/visibility")
    public ResponseEntity<?> visibility(@PathVariable Long id,
                                        @RequestBody VisibilityRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        if (!canManage(prompt, authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "OWNER_ONLY",
                    "작성자만 공유 상태를 변경할 수 있습니다."
            );
        }
        prompt.changeVisibility(Boolean.TRUE.equals(request.isShared()));
        promptRepository.save(prompt);
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, isSaved(id, memberId), isLiked(id, memberId)));
    }

    @PostMapping("/{id}/view")
    public ResponseEntity<?> view(@PathVariable Long id,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        prompt.increaseViews();
        promptRepository.save(prompt);
        return ResponseEntity.ok(Map.of("id", id, "views", prompt.getViews()));
    }

    @PostMapping("/{id}/save")
    public ResponseEntity<?> save(@PathVariable Long id,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        if (!saveRepository.existsByPromptIdAndMemberId(id, memberId)) {
            saveRepository.save(new PromptSave(id, memberId));
            prompt.increaseSaves();
            promptRepository.save(prompt);
        }
        return ResponseEntity.ok(Map.of("id", id, "saves", prompt.getSaves(), "isSaved", true));
    }

    @DeleteMapping("/{id}/save")
    public ResponseEntity<?> unsave(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        saveRepository.findByPromptIdAndMemberId(id, memberId).ifPresent(save -> {
            saveRepository.delete(save);
            prompt.decreaseSaves();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(Map.of("id", id, "saves", prompt.getSaves(), "isSaved", false));
    }

    @PostMapping("/{id}/like")
    public ResponseEntity<?> like(@PathVariable Long id,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        if (!likeRepository.existsByPromptIdAndMemberId(id, memberId)) {
            likeRepository.save(new PromptLike(id, memberId));
            prompt.increaseLikes();
            promptRepository.save(prompt);
        }
        return ResponseEntity.ok(Map.of("id", id, "likes", prompt.getLikes(), "isLiked", true));
    }

    @DeleteMapping("/{id}/like")
    public ResponseEntity<?> unlike(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || !canView(prompt, authorization)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        likeRepository.findByPromptIdAndMemberId(id, memberId).ifPresent(like -> {
            likeRepository.delete(like);
            prompt.decreaseLikes();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(Map.of("id", id, "likes", prompt.getLikes(), "isLiked", false));
    }

    @GetMapping("/my")
    public Map<String, Object> myPrompts(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @RequestParam(defaultValue = "all") String filter,
                                         @RequestParam(defaultValue = "1") int page,
                                         @RequestParam(required = false) Integer size,
                                         @RequestParam(required = false) Integer pageSize) {
        int resolvedSize = size != null ? size : (pageSize != null ? pageSize : 16);
        Long memberId = requireMemberId(authorization);
        List<Long> savedIds = saveRepository.findByMemberId(memberId).stream().map(PromptSave::getPromptId).toList();
        List<Long> likedIds = likeRepository.findByMemberId(memberId).stream().map(PromptLike::getPromptId).toList();
        List<PromptPost> prompts = promptRepository.findAll().stream()
                .filter(prompt -> !prompt.isDeleted())
                .filter(prompt -> switch (filter) {
                    case "community" -> savedIds.contains(prompt.getId()) && !Objects.equals(prompt.getAuthorId(), memberId);
                    case "mine" -> Objects.equals(prompt.getAuthorId(), memberId);
                    case "liked" -> likedIds.contains(prompt.getId());
                    default -> savedIds.contains(prompt.getId()) || likedIds.contains(prompt.getId()) || Objects.equals(prompt.getAuthorId(), memberId);
                })
                .sorted(comparator("latest"))
                .toList();
        return pageResponse(prompts, page, resolvedSize, memberId);
    }

    private List<Map<String, Object>> copyHistory(
            List<Map<String, String>> history
    ) {
        List<Map<String, Object>> copied =
                new ArrayList<>();

        if (history == null) {
            return copied;
        }

        for (Map<String, String> item : history) {
            if (item == null) {
                continue;
            }

            String role = item.get("role");
            String content = item.get("content");

            if (role == null || content == null) {
                continue;
            }

            Map<String, Object> message =
                    new LinkedHashMap<>();

            message.put("role", role);
            message.put("content", content);

            copied.add(message);
        }

        return copied;
    }

    private List<Map<String, String>> toRagHistory(
            List<Map<String, Object>> messages
    ) {
        List<Map<String, String>> history =
                new ArrayList<>();

        for (Map<String, Object> message : messages) {
            Object role = message.get("role");
            Object content = message.get("content");

            if (role == null || content == null) {
                continue;
            }

            history.add(
                    Map.of(
                            "role", String.valueOf(role),
                            "content", String.valueOf(content)
                    )
            );
        }

        return history;
    }

    private void appendMessages(
            List<Map<String, Object>> messages,
            String prompt,
            Map<String, Object> response
    ) {
        String now = LocalDateTime.now().toString();

        Map<String, Object> userMessage =
                new LinkedHashMap<>();

        userMessage.put(
                "id",
                "user-" + UUID.randomUUID()
        );
        userMessage.put("role", "user");
        userMessage.put("content", prompt);
        userMessage.put("createdAt", now);

        Map<String, Object> assistantMessage =
                new LinkedHashMap<>();

        assistantMessage.put(
                "id",
                "assistant-" + UUID.randomUUID()
        );
        assistantMessage.put("role", "assistant");
        assistantMessage.put(
                "content",
                response.get("answer")
        );
        assistantMessage.put(
                "improvedPrompt",
                response.get("improvedPrompt")
        );
        assistantMessage.put(
                "sources",
                response.get("sources")
        );
        assistantMessage.put(
                "ragStatus",
                response.get("ragStatus")
        );
        assistantMessage.put("createdAt", now);

        messages.add(userMessage);
        messages.add(assistantMessage);
    }

    private List<Map<String, Object>> readMessages(
            String json
    ) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }

        try {
            return objectMapper.readValue(
                    json,
                    new TypeReference<
                            List<Map<String, Object>>
                            >() {}
            );
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String writeMessages(
            List<Map<String, Object>> messages
    ) {
        try {
            return objectMapper.writeValueAsString(messages);
        } catch (Exception e) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "THREAD_SAVE_FAILED",
                    "대화 내용을 저장할 수 없습니다."
            );
        }
    }

    private String normalizeCategory(String category) {
        return category == null || category.isBlank()
                ? "prompt_techniques"
                : category.trim();
    }

	private Long resolveRequestedThreadId(ImproveRequest request) {
		Long conversationId = request.conversationId();
		Long threadId = request.threadId();

		if (conversationId != null
				&& threadId != null
				&& !Objects.equals(conversationId, threadId)) {
			throw new ApiException(
					HttpStatus.BAD_REQUEST,
					"THREAD_ID_MISMATCH",
					"conversationId와 threadId가 서로 일치하지 않습니다."
			);
		}

		return conversationId != null ? conversationId : threadId;
	}

    private String makeThreadTitle(String prompt) {
        String normalized =
                prompt.replaceAll("\\s+", " ").trim();

        if (normalized.length() <= 30) {
            return normalized;
        }

        return normalized.substring(0, 30) + "...";
    }

    private String firstNonBlank(
            Map<?, ?> source,
            String... keys
    ) {
        if (source == null) {
            return null;
        }

        for (String key : keys) {
            Object value = source.get(key);

            if (value == null) {
                continue;
            }

            String text = String.valueOf(value).trim();

            if (!text.isBlank()) {
                return text;
            }
        }

        return null;
    }

    @PostMapping("/improve")
    public Map<String, Object> improve(
            @RequestBody ImproveRequest request,
            @RequestHeader(value = "Authorization", required = false)
            String authorization
    ) {
        String prompt = request.prompt() == null
                ? ""
                : request.prompt().trim();

        if (prompt.isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "PROMPT_REQUIRED",
                    "개선할 프롬프트를 입력해 주세요."
            );
        }

        Long memberId =
                authService.currentMemberIdOrNull(authorization);

	Long requestedThreadId = resolveRequestedThreadId(request);

        if (requestedThreadId != null && memberId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "LOGIN_REQUIRED",
                    "저장된 대화를 이어가려면 로그인이 필요합니다."
            );
        }

        MakeThread thread = null;
        List<Map<String, Object>> messages;

        if (requestedThreadId != null) {
            thread = makeThreadRepository
                    .findByIdAndMemberId(
                            requestedThreadId,
                            memberId
                    )
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.NOT_FOUND,
                            "THREAD_NOT_FOUND",
                            "대화를 찾을 수 없습니다."
                    ));

            messages = readMessages(
                    thread.getMessagesJson()
            );
        } else {
            messages = copyHistory(request.history());
        }

        List<Map<String, String>> ragHistory =
                toRagHistory(messages);

        Map<?, ?> ragResponse = Map.of();
        boolean ragConnected = false;

        try {
            Map<String, Object> ragRequest =
                    new LinkedHashMap<>();

            ragRequest.put("query", prompt);
            ragRequest.put(
                    "collection_name",
                    normalizeCategory(request.category())
            );
            ragRequest.put("top_k", 5);
            ragRequest.put("history", ragHistory);

            Map<?, ?> response = webClient.post()
                    .uri(ragServerUrl + "/query")
                    .bodyValue(ragRequest)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response != null) {
                ragResponse = response;
                ragConnected = true;
            }
        } catch (Exception ignored) {
            // RAG 서버 연결 실패 시 fallback 결과를 반환한다.
        }

        Map<String, Object> body =
                buildImproveResponse(
                        prompt,
                        ragResponse,
                        ragConnected
                );

        Long savedThreadId = null;

        if (memberId != null) {
            appendMessages(
                    messages,
                    prompt,
                    body
            );

            String messagesJson = writeMessages(messages);

            if (thread == null) {
                thread = new MakeThread(
                        memberId,
                        makeThreadTitle(prompt),
                        messagesJson,
                        null
                );
            } else {
                thread.update(
                        thread.getTitle(),
                        messagesJson,
                        thread.getFolderId()
                );
            }

            thread = makeThreadRepository.save(thread);
            savedThreadId = thread.getId();
        }

        body.put("conversationId", savedThreadId);
        body.put("threadId", savedThreadId);

        return body;
    }

    private Map<String, Object> buildImproveResponse(
            String prompt,
            Map<?, ?> ragResponse,
            boolean ragConnected
    ) {
        String improvedPrompt = firstNonBlank(
                ragResponse,
                "improvedPrompt",
                "improved_prompt",
                "result",
                "response",
                "answer"
        );

        if (improvedPrompt == null) {
            improvedPrompt = """
                    당신은 사용자의 목적을 정확히 파악해 실행 가능한 결과물을 만드는 AI 전문가입니다.

                    [사용자 요청]
                    %s

                    [수행 방식]
                    1. 사용자의 목적을 먼저 분석합니다.
                    2. 부족한 조건은 합리적으로 보완합니다.
                    3. 결과는 바로 사용할 수 있는 형태로 작성합니다.
                    4. 필요한 경우 예시와 출력 형식을 함께 제시합니다.
                    """.formatted(prompt);
        }

        String answer = firstNonBlank(
                ragResponse,
                "answer",
                "response",
                "result"
        );

        if (answer == null) {
            answer = improvedPrompt;
        }

        List<?> sources =
                ragResponse.get("sources") instanceof List<?> list
                        ? list
                        : List.of();

        String ragStatus;

        if (!ragConnected) {
            ragStatus = "fallback";
        } else if (sources.isEmpty()) {
            ragStatus = "no_evidence";
        } else {
            ragStatus = "ok";
        }

        Map<String, Object> body =
                new LinkedHashMap<>();

        body.put("answer", answer);
        body.put("improvedPrompt", improvedPrompt);
        body.put("sources", sources);
        body.put("ragStatus", ragStatus);
        body.put(
                "techniquesApplied",
                List.of(
                        "Role Prompting",
                        "Specificity",
                        "Output Format"
                )
        );
        body.put(
                "changes",
                List.of(
                        "AI의 역할을 명확하게 지정",
                        "요청 조건을 구조화",
                        "출력 형식을 구체화"
                )
        );

        return body;
    }

    private Map<String, Object> pageResponse(List<PromptPost> prompts, int page, int size, Long memberId) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        int from = Math.min((safePage - 1) * safeSize, prompts.size());
        int to = Math.min(from + safeSize, prompts.size());
        List<Map<String, Object>> items = prompts.subList(from, to).stream()
                .map(prompt -> PromptMapper.toPromptResponse(prompt, memberId, isSaved(prompt.getId(), memberId), isLiked(prompt.getId(), memberId)))
                .toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", prompts.size());
        body.put("totalPages", (int) Math.ceil((double) prompts.size() / safeSize));
        return body;
    }

    private Comparator<PromptPost> comparator(String sort) {
        Comparator<PromptPost> byViews =
                Comparator.comparingLong(PromptPost::getViews).reversed();
        Comparator<PromptPost> byComments =
                Comparator.comparingLong(PromptPost::getComments).reversed();
        Comparator<PromptPost> bySaves =
                Comparator.comparingLong(PromptPost::getSaves).reversed();
        Comparator<PromptPost> byLikes =
                Comparator.comparingLong(PromptPost::getLikes).reversed();
        Comparator<PromptPost> byLatest =
                Comparator.comparing(PromptPost::getCreatedAt).reversed();
        Comparator<PromptPost> byId =
                Comparator.comparing(PromptPost::getId).reversed();

        return switch (sort == null ? "popular" : sort) {
            case "saves" -> bySaves
                    .thenComparing(byViews)
                    .thenComparing(byComments)
                    .thenComparing(byLatest)
                    .thenComparing(byId);

            case "comments" -> byComments
                    .thenComparing(byViews)
                    .thenComparing(bySaves)
                    .thenComparing(byLatest)
                    .thenComparing(byId);

            case "likes" -> byLikes
                    .thenComparing(byViews)
                    .thenComparing(bySaves)
                    .thenComparing(byLatest)
                    .thenComparing(byId);

            case "latest" -> byLatest
                    .thenComparing(byViews)
                    .thenComparing(byId);

            default -> byViews
                    .thenComparing(byComments)
                    .thenComparing(bySaves)
                    .thenComparing(byLatest)
                    .thenComparing(byId);
        };
    }

    private boolean isSaved(Long promptId, Long memberId) {
        return memberId != null && saveRepository.existsByPromptIdAndMemberId(promptId, memberId);
    }

    private boolean isLiked(Long promptId, Long memberId) {
        return memberId != null && likeRepository.existsByPromptIdAndMemberId(promptId, memberId);
    }

    private Long requireMemberId(String authorization) {
        Long memberId =
                authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "LOGIN_REQUIRED",
                    "로그인이 필요합니다."
            );
        }

        return memberId;
    }

    private boolean canView(PromptPost prompt, String authorization) {
        if (prompt == null || prompt.isDeleted()) {
            return false;
        }

        if (prompt.isShared()) {
            return true;
        }

        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) {
            return false;
        }

        if (Objects.equals(prompt.getAuthorId(), memberId)) {
            return true;
        }

        return authService.getMemberFromAuthorization(authorization)
                .map(member -> "ADMIN".equalsIgnoreCase(member.getRole()))
                .orElse(false);
    }

    private boolean canManage(PromptPost prompt, String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return false;
        boolean isAuthor = prompt.getAuthorId() != null && Objects.equals(prompt.getAuthorId(), memberId);
        boolean isAdmin = authService.getMemberFromAuthorization(authorization)
                .map(member -> "ADMIN".equalsIgnoreCase(member.getRole()))
                .orElse(false);
        return isAuthor || isAdmin;
    }

    private boolean matchesSearch(PromptPost prompt, String scope, String query, String keyword, String author) {
        String q = firstNonBlank(query, keyword);
        String normalizedScope = scope == null || scope.isBlank() ? "all" : scope.toLowerCase();

        if (author != null && !author.isBlank()) {
            String authorText = prompt.getAuthorNickname() == null ? "" : prompt.getAuthorNickname();
            if (!authorText.toLowerCase().contains(author.toLowerCase())) return false;
        }

        if (q == null || q.isBlank()) return true;
        String lower = q.toLowerCase();
        return switch (normalizedScope) {
            case "tag", "hashtag", "tags" -> PromptMapper.splitTags(prompt.getTagsCsv()).stream()
                    .anyMatch(tag -> tag.toLowerCase().contains(lower));
            case "author" -> prompt.getAuthorNickname() != null && prompt.getAuthorNickname().toLowerCase().contains(lower);
            case "keyword", "title", "text" -> containsPromptText(prompt, lower);
            default -> containsPromptText(prompt, lower)
                    || (prompt.getAuthorNickname() != null && prompt.getAuthorNickname().toLowerCase().contains(lower))
                    || PromptMapper.splitTags(prompt.getTagsCsv()).stream().anyMatch(tag -> tag.toLowerCase().contains(lower));
        };
    }

    private boolean containsPromptText(PromptPost prompt, String lower) {
        return (prompt.getTitle() != null && prompt.getTitle().toLowerCase().contains(lower))
                || (prompt.getText() != null && prompt.getText().toLowerCase().contains(lower));
    }

    private String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) return first;
        if (second != null && !second.isBlank()) return second;
        return null;
    }

    private void increaseTagUsage(List<String> tags) {
        if (tags == null) return;
        for (String raw : tags) {
            String name = Tag.normalize(raw);
            if (name.isBlank()) continue;
            Tag tag = tagRepository.findByName(name).orElseGet(() -> new Tag(name));
            tag.increaseUseCount();
            tagRepository.save(tag);
        }
    }

    public record SharePromptRequest(String title, String text, List<String> tags) {}
    public record VisibilityRequest(Boolean isShared) {}
    public record ImproveRequest(
            String prompt,
            String category,
            Long conversationId,
            Long threadId,
            List<Map<String, String>> history
    ) {}
}
