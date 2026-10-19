package com.ttalkak.member;

import com.ttalkak.auth.AuthService;
import com.ttalkak.common.pagination.PageWindow;
import com.ttalkak.community.CommentController;
import com.ttalkak.community.CommentRepository;
import com.ttalkak.community.ReportController;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.prompt.*;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/me")
public class MeController {
    private final AuthService authService;
    private final PromptRepository promptRepository;
    private final PromptSaveRepository saveRepository;
    private final PromptLikeRepository likeRepository;
    private final CommentRepository commentRepository;
    private final ReportRepository reportRepository;
    private final ReportController reportController;

    public MeController(AuthService authService,
                        PromptRepository promptRepository,
                        PromptSaveRepository saveRepository,
                        PromptLikeRepository likeRepository,
                        CommentRepository commentRepository,
                        ReportRepository reportRepository,
                        ReportController reportController) {
        this.authService = authService;
        this.promptRepository = promptRepository;
        this.saveRepository = saveRepository;
        this.likeRepository = likeRepository;
        this.commentRepository = commentRepository;
        this.reportRepository = reportRepository;
        this.reportController = reportController;
    }

    @GetMapping("/library")
    public Map<String, Object> library(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestParam(defaultValue = "all") String filter,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "16") int pageSize) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return pageResponse(List.of(), page, pageSize, memberId);
        List<Long> savedIds = saveRepository.findByMemberId(memberId).stream().map(PromptSave::getPromptId).toList();
        List<Long> likedIds = likeRepository.findByMemberId(memberId).stream().map(PromptLike::getPromptId).toList();
        List<PromptPost> prompts = promptRepository.findAll().stream()
                .filter(prompt -> !prompt.isDeleted())
                // Saved/liked links must not keep revealing a different author's
                // post after they change its visibility to private.
                .filter(prompt -> prompt.isShared()
                        || Objects.equals(prompt.getAuthorId(), memberId))
                .filter(prompt -> switch (filter) {
                    case "community" -> savedIds.contains(prompt.getId()) && !Objects.equals(prompt.getAuthorId(), memberId);
                    case "mine" -> Objects.equals(prompt.getAuthorId(), memberId);
                    case "liked" -> likedIds.contains(prompt.getId());
                    default -> savedIds.contains(prompt.getId()) || likedIds.contains(prompt.getId()) || Objects.equals(prompt.getAuthorId(), memberId);
                })
                .toList();
        return pageResponse(prompts, page, pageSize, memberId);
    }

    @GetMapping("/prompts")
    public Map<String, Object> myPrompts(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = size != null ? size : (pageSize != null ? pageSize : 16);
        int safePage = PageWindow.normalizePage(page);
        int safeSize = PageWindow.normalizeSize(resolvedSize);
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("items", List.of());
            empty.put("content", List.of());
            empty.put("page", safePage);
            empty.put("size", safeSize);
            empty.put("total", 0);
            empty.put("totalPages", 0);
            return empty;
        }

        List<PromptPost> prompts = promptRepository
                .findByDeletedFalseAndAuthorId(memberId)
                .stream()
                .sorted(java.util.Comparator.comparing(PromptPost::getCreatedAt).reversed())
                .toList();

        PageWindow bounds = PageWindow.of(safePage, safeSize, prompts.size());
        int from = bounds.from();
        int to = bounds.to();

        List<Map<String, Object>> items = prompts.subList(from, to).stream()
                .map(prompt -> PromptMapper.toPromptResponse(
                        prompt,
                        memberId,
                        saveRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId),
                        likeRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId)
                ))
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
    @GetMapping("/comments")
    public Map<String, Object> myComments(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = size != null ? size : (pageSize != null ? pageSize : 16);
        int safePage = PageWindow.normalizePage(page);
        int safeSize = PageWindow.normalizeSize(resolvedSize);
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("items", List.of());
            empty.put("content", List.of());
            empty.put("page", safePage);
            empty.put("size", safeSize);
            empty.put("total", 0);
            empty.put("totalPages", 0);
            return empty;
        }

        var comments = commentRepository.findByAuthorIdOrderByCreatedAtDesc(memberId);
        PageWindow bounds = PageWindow.of(safePage, safeSize, comments.size());
        int from = bounds.from();
        int to = bounds.to();

        List<Map<String, Object>> items = comments.subList(from, to).stream()
                .map(comment -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", comment.getId());
                    map.put("promptId", comment.getPromptId());
                    map.put("parentId", comment.getParentId());
                    map.put(
                            "text",
                            comment.isHidden()
                                    ? "관리자에 의해 숨겨진 댓글입니다."
                                    : comment.getText()
                    );
                    map.put("likes", comment.getLikes());
                    map.put("edited", comment.isEdited());
                    map.put("deleted", comment.isDeleted());
                    map.put("hidden", comment.isHidden());
                    map.put("hiddenAt", null);
                    map.put("isMine", true);
                    map.put("createdAt", comment.getCreatedAt().toString());

                    promptRepository.findById(comment.getPromptId())
                            .filter(prompt -> !prompt.isDeleted()
                                    && (prompt.isShared()
                                        || Objects.equals(prompt.getAuthorId(), memberId)))
                            .ifPresentOrElse(prompt -> {
                        Map<String, Object> author = new LinkedHashMap<>();
                        author.put("id", prompt.getAuthorId());
                        author.put("nickname", prompt.getAuthorNickname());

                        Map<String, Object> originalPrompt = new LinkedHashMap<>();
                        originalPrompt.put("id", prompt.getId());
                        originalPrompt.put("title", prompt.getTitle());
                        originalPrompt.put("text", prompt.getText());
                        originalPrompt.put("author", author);

                        map.put("prompt", originalPrompt);
                        map.put("promptTitle", prompt.getTitle());
                    }, () -> {
                        map.put("prompt", null);
                        map.put("promptTitle", null);
                    });

                    return map;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", comments.size());
        body.put("totalPages", (int) Math.ceil((double) comments.size() / safeSize));
        return body;
    }
    @GetMapping("/reports")
    public Map<String, Object> myReports(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = size != null ? size : (pageSize != null ? pageSize : 16);
        int safePage = PageWindow.normalizePage(page);
        int safeSize = PageWindow.normalizeSize(resolvedSize);
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("items", List.of());
            empty.put("content", List.of());
            empty.put("page", safePage);
            empty.put("size", safeSize);
            empty.put("total", 0);
            empty.put("totalPages", 0);
            return empty;
        }

        var reports = reportRepository.findByReporterIdOrderByCreatedAtDesc(memberId);
        PageWindow bounds = PageWindow.of(safePage, safeSize, reports.size());
        int from = bounds.from();
        int to = bounds.to();

        List<Map<String, Object>> items = reports.subList(from, to).stream()
                .map(report -> reportController.toResponseForReporter(report, memberId))
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", reports.size());
        body.put("totalPages", (int) Math.ceil((double) reports.size() / safeSize));
        return body;
    }
    private Map<String, Object> pageResponse(List<PromptPost> prompts, int page, int size, Long memberId) {
        int safePage = PageWindow.normalizePage(page);
        int safeSize = PageWindow.normalizeSize(size);
        PageWindow bounds = PageWindow.of(safePage, safeSize, prompts.size());
        int from = bounds.from();
        int to = bounds.to();
        List<Map<String, Object>> items = prompts.subList(from, to).stream()
                .map(prompt -> PromptMapper.toPromptResponse(prompt, memberId,
                        memberId != null && saveRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId),
                        memberId != null && likeRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId)))
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
}
