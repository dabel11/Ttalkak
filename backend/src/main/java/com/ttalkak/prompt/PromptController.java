package com.ttalkak.prompt;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.Member;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {
    private final PromptRepository promptRepository;
    private final PromptSaveRepository saveRepository;
    private final PromptLikeRepository likeRepository;
    private final TagRepository tagRepository;
    private final AuthService authService;
    private final WebClient webClient;

    @Value("${rag.server-url:http://localhost:8000}")
    private String ragServerUrl;

    public PromptController(PromptRepository promptRepository,
                            PromptSaveRepository saveRepository,
                            PromptLikeRepository likeRepository,
                            TagRepository tagRepository,
                            AuthService authService,
                            WebClient.Builder webClientBuilder) {
        this.promptRepository = promptRepository;
        this.saveRepository = saveRepository;
        this.likeRepository = likeRepository;
        this.tagRepository = tagRepository;
        this.authService = authService;
        this.webClient = webClientBuilder.build();
    }

    @GetMapping
    public Map<String, Object> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestParam(required = false) String tags,
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
                .sorted(comparator(sort))
                .toList();

        return pageResponse(filtered, page, resolvedSize, memberId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        return promptRepository.findById(id)
                .filter(prompt -> !prompt.isDeleted())
                .map(prompt -> ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, isSaved(id, memberId), isLiked(id, memberId))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> share(@RequestBody SharePromptRequest request,
                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
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
        Long memberId = authService.currentMemberIdOrNull(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
        if (memberId != null && prompt.getAuthorId() != null && !Objects.equals(prompt.getAuthorId(), memberId)) {
            return ResponseEntity.status(403).body(Map.of("message", "수정 권한이 없습니다."));
        }
        prompt.update(request.title(), request.text(), PromptMapper.joinTags(request.tags()));
        promptRepository.save(prompt);
        increaseTagUsage(request.tags());
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, isSaved(id, memberId), isLiked(id, memberId)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id,
                                    @RequestHeader(value = "Authorization", required = false) String authorization) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null) return ResponseEntity.notFound().build();
        prompt.delete();
        promptRepository.save(prompt);
        return ResponseEntity.ok(Map.of("deleted", true, "id", id));
    }

    @PatchMapping("/{id}/visibility")
    public ResponseEntity<?> visibility(@PathVariable Long id,
                                        @RequestBody VisibilityRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
        prompt.changeVisibility(Boolean.TRUE.equals(request.isShared()));
        promptRepository.save(prompt);
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, memberId, isSaved(id, memberId), isLiked(id, memberId)));
    }

    @PostMapping("/{id}/view")
    public ResponseEntity<?> view(@PathVariable Long id) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
        prompt.increaseViews();
        promptRepository.save(prompt);
        return ResponseEntity.ok(Map.of("id", id, "views", prompt.getViews()));
    }

    @PostMapping("/{id}/save")
    public ResponseEntity<?> save(@PathVariable Long id,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
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
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
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
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
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
        if (prompt == null || prompt.isDeleted()) return ResponseEntity.notFound().build();
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

    @PostMapping("/improve")
    public Map<String, Object> improve(@RequestBody ImproveRequest request) {
        try {
            Map<?, ?> ragResponse = webClient.post()
                    .uri(ragServerUrl + "/query")
                    .bodyValue(Map.of("query", request.prompt(), "top_k", 5))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            if (ragResponse != null) {
                return improveFallback(request.prompt(), ragResponse);
            }
        } catch (Exception ignored) {
            // rag-server가 아직 없으면 데모 개선 결과 반환
        }
        return improveFallback(request.prompt(), Map.of());
    }

    private Map<String, Object> improveFallback(String prompt, Map<?, ?> ragResponse) {
        String improved = """
                너는 사용자의 목적을 정확히 파악해 결과물을 만드는 AI 전문가다.

                [사용자 요청]
                %s

                [수행 방식]
                1. 사용자의 목적을 먼저 분석한다.
                2. 부족한 조건이 있으면 합리적으로 보완한다.
                3. 결과는 바로 사용할 수 있는 형태로 작성한다.
                4. 필요한 경우 예시와 출력 형식을 함께 제시한다.
                """.formatted(prompt == null ? "" : prompt);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("conversationId", System.currentTimeMillis());
        body.put("answer", "**개선된 프롬프트:**\n" + improved);
        body.put("improvedPrompt", improved);
        body.put("techniquesApplied", List.of("Role Prompting", "Specificity", "Output Format"));
        body.put("changes", List.of("AI의 역할을 명확히 지정함", "요청 조건을 구조화함", "출력 형식을 구체화함"));
        body.put("sources", ragResponse.containsKey("sources") ? ragResponse.get("sources") : List.of());
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
        Comparator<PromptPost> byLatest = Comparator.comparing(PromptPost::getCreatedAt).reversed();
        return switch (sort == null ? "popular" : sort) {
            case "saves" -> Comparator.comparing(PromptPost::getSaves).reversed().thenComparing(PromptPost::getViews).reversed();
            case "comments" -> Comparator.comparing(PromptPost::getComments).reversed().thenComparing(PromptPost::getViews).reversed();
            case "likes" -> Comparator.comparing(PromptPost::getLikes).reversed().thenComparing(PromptPost::getViews).reversed();
            case "latest" -> byLatest;
            default -> Comparator.comparing(PromptPost::getViews).reversed()
                    .thenComparing(PromptPost::getComments).reversed()
                    .thenComparing(PromptPost::getSaves).reversed();
        };
    }

    private boolean isSaved(Long promptId, Long memberId) {
        return memberId != null && saveRepository.existsByPromptIdAndMemberId(promptId, memberId);
    }

    private boolean isLiked(Long promptId, Long memberId) {
        return memberId != null && likeRepository.existsByPromptIdAndMemberId(promptId, memberId);
    }

    private Long requireMemberId(String authorization) {
        return authService.currentMemberIdOrNull(authorization) == null ? 0L : authService.currentMemberIdOrNull(authorization);
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
    public record ImproveRequest(String prompt, String category, Long conversationId, List<Map<String, String>> history) {}
}
