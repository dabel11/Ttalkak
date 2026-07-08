package com.ttalkak.member;

import com.ttalkak.auth.AuthService;
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
    public List<Map<String, Object>> myPrompts(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return List.of();
        return promptRepository.findByDeletedFalseAndAuthorId(memberId).stream()
                .map(prompt -> PromptMapper.toPromptResponse(prompt, memberId,
                        saveRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId),
                        likeRepository.existsByPromptIdAndMemberId(prompt.getId(), memberId)))
                .toList();
    }

    @GetMapping("/comments")
    public List<Map<String, Object>> myComments(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return List.of();
        return commentRepository.findByAuthorIdOrderByCreatedAtDesc(memberId).stream()
                .map(comment -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", comment.getId());
                    map.put("promptId", comment.getPromptId());
                    map.put("parentId", comment.getParentId());
                    map.put("text", comment.getText());
                    map.put("likes", comment.getLikes());
                    map.put("edited", comment.isEdited());
                    map.put("isMine", true);
                    return map;
                })
                .toList();
    }

    @GetMapping("/reports")
    public List<Map<String, Object>> myReports(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) return List.of();
        return reportRepository.findByReporterIdOrderByCreatedAtDesc(memberId).stream()
                .map(reportController::toResponse)
                .toList();
    }

    private Map<String, Object> pageResponse(List<PromptPost> prompts, int page, int size, Long memberId) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        int from = Math.min((safePage - 1) * safeSize, prompts.size());
        int to = Math.min(from + safeSize, prompts.size());
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
