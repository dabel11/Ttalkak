package com.ttalkak.prompt;

import com.ttalkak.auth.AuthService;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@RestController
public class PromptRevisionRequestController {

    private final PromptRevisionRequestRepository revisionRequestRepository;
    private final PromptRepository promptRepository;
    private final AuthService authService;

    public PromptRevisionRequestController(
            PromptRevisionRequestRepository revisionRequestRepository,
            PromptRepository promptRepository,
            AuthService authService
    ) {
        this.revisionRequestRepository = revisionRequestRepository;
        this.promptRepository = promptRepository;
        this.authService = authService;
    }

    @PostMapping("/api/prompts/{promptId}/revision-requests")
    public ResponseEntity<?> createRevisionRequest(
            @PathVariable Long promptId,
            @RequestBody RevisionCreateRequest request,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long requesterId = requireMemberId(authorization);

        PromptPost prompt = promptRepository.findById(promptId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "프롬프트를 찾을 수 없습니다."
                ));

        if (prompt.isDeleted() || !prompt.isShared()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "수정 요청이 가능한 프롬프트를 찾을 수 없습니다."
            );
        }

        if (Objects.equals(prompt.getAuthorId(), requesterId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "본인이 작성한 프롬프트는 직접 수정해 주세요."
            );
        }

        if (revisionRequestRepository
                .existsByPromptIdAndRequesterIdAndStatusIgnoreCase(
                        promptId,
                        requesterId,
                        "pending"
                )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 처리 대기 중인 수정 요청이 있습니다."
            );
        }

        String proposedTitle = resolveRequiredValue(
                request.title(),
                prompt.getTitle(),
                "제목"
        );

        String proposedText = resolveRequiredValue(
                request.text(),
                prompt.getText(),
                "본문"
        );

        String proposedTagsCsv = request.tags() == null
                ? prompt.getTagsCsv()
                : PromptMapper.joinTags(request.tags());

        boolean changed =
                !Objects.equals(prompt.getTitle(), proposedTitle)
                        || !Objects.equals(prompt.getText(), proposedText)
                        || !Objects.equals(
                                normalizeNullable(prompt.getTagsCsv()),
                                normalizeNullable(proposedTagsCsv)
                        );

        if (!changed) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "기존 프롬프트와 다른 수정 내용을 입력해 주세요."
            );
        }

        PromptRevisionRequest revision =
                new PromptRevisionRequest(
                        prompt.getId(),
                        requesterId,
                        authService.currentNickname(authorization),
                        prompt.getTitle(),
                        prompt.getText(),
                        prompt.getTagsCsv(),
                        proposedTitle,
                        proposedText,
                        proposedTagsCsv,
                        normalizeOptional(request.reason())
                );

        revisionRequestRepository.save(revision);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(toResponse(revision));
    }

    @GetMapping("/api/me/revision-requests")
    public List<Map<String, Object>> myRevisionRequests(
            @RequestParam(required = false) String status,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long requesterId = requireMemberId(authorization);
        String normalizedStatus = normalizeListStatus(status);

        return revisionRequestRepository
                .findByRequesterIdOrderByCreatedAtDesc(requesterId)
                .stream()
                .filter(revision ->
                        "all".equals(normalizedStatus)
                                || normalizedStatus.equalsIgnoreCase(
                                        revision.getStatus()
                                )
                )
                .map(this::toResponse)
                .toList();
    }

    @GetMapping("/api/admin/revision-requests")
    public Map<String, Object> adminRevisionRequests(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = resolvePageSize(size, pageSize);
        String normalizedStatus = normalizeListStatus(status);

        List<Map<String, Object>> revisions =
                (
                        "all".equals(normalizedStatus)
                                ? revisionRequestRepository
                                        .findAllByOrderByCreatedAtDesc()
                                : revisionRequestRepository
                                        .findByStatusIgnoreCaseOrderByCreatedAtDesc(
                                                normalizedStatus
                                        )
                )
                        .stream()
                        .map(this::toResponse)
                        .toList();

        return pageResponse(revisions, page, resolvedSize);
    }

    @Transactional
    @PatchMapping(
            "/api/admin/revision-requests/{requestId}/status"
    )
    public ResponseEntity<?> reviewRevisionRequest(
            @PathVariable Long requestId,
            @RequestBody RevisionStatusRequest request,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long reviewerId = requireMemberId(authorization);

        PromptRevisionRequest revision =
                revisionRequestRepository.findById(requestId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "수정 요청을 찾을 수 없습니다."
                        ));

        if (!revision.isPending()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 처리된 수정 요청입니다."
            );
        }

        String status = normalizeReviewStatus(request.status());
        String memo = normalizeOptional(request.memo());

        if ("approved".equals(status)) {
            PromptPost prompt = promptRepository
                    .findById(revision.getPromptId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "수정할 프롬프트가 존재하지 않습니다."
                    ));

            if (prompt.isDeleted()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "삭제된 프롬프트에는 수정 내용을 반영할 수 없습니다."
                );
            }

            prompt.update(
                    revision.getProposedTitle(),
                    revision.getProposedText(),
                    revision.getProposedTagsCsv()
            );

            promptRepository.save(prompt);
            revision.approve(reviewerId, memo);
        }
        else {
            revision.reject(reviewerId, memo);
        }

        revisionRequestRepository.save(revision);

        return ResponseEntity.ok(toResponse(revision));
    }

    private Map<String, Object> toResponse(
            PromptRevisionRequest revision
    ) {
        Map<String, Object> requester = new LinkedHashMap<>();
        requester.put("id", revision.getRequesterId());
        requester.put(
                "nickname",
                revision.getRequesterNickname()
        );

        Map<String, Object> original = new LinkedHashMap<>();
        original.put("title", revision.getOriginalTitle());
        original.put("text", revision.getOriginalText());
        original.put(
                "tags",
                PromptMapper.splitTags(
                        revision.getOriginalTagsCsv()
                )
        );

        Map<String, Object> proposed = new LinkedHashMap<>();
        proposed.put("title", revision.getProposedTitle());
        proposed.put("text", revision.getProposedText());
        proposed.put(
                "tags",
                PromptMapper.splitTags(
                        revision.getProposedTagsCsv()
                )
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", revision.getId());
        body.put("promptId", revision.getPromptId());
        body.put("requester", requester);
        body.put("reason", revision.getReason());
        body.put("status", revision.getStatus());
        body.put("original", original);
        body.put("proposed", proposed);
        body.put("adminMemo", revision.getAdminMemo());
        body.put("reviewedBy", revision.getReviewedBy());
        body.put(
                "reviewedAt",
                formatDateTime(revision.getReviewedAt())
        );
        body.put(
                "createdAt",
                formatDateTime(revision.getCreatedAt())
        );

        promptRepository.findById(revision.getPromptId())
                .ifPresentOrElse(
                        prompt -> {
                            Map<String, Object> currentPrompt =
                                    new LinkedHashMap<>();

                            currentPrompt.put("exists", true);
                            currentPrompt.put("title", prompt.getTitle());
                            currentPrompt.put(
                                    "shared",
                                    prompt.isShared()
                            );
                            currentPrompt.put(
                                    "deleted",
                                    prompt.isDeleted()
                            );

                            body.put("prompt", currentPrompt);
                        },
                        () -> body.put(
                                "prompt",
                                Map.of("exists", false)
                        )
                );

        return body;
    }

    private Long requireMemberId(String authorization) {
        Long memberId =
                authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "로그인이 필요합니다."
            );
        }

        return memberId;
    }

    private String resolveRequiredValue(
            String proposed,
            String current,
            String fieldName
    ) {
        if (proposed == null) {
            return current;
        }

        String normalized = proposed.trim();

        if (normalized.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    fieldName + "은 비워둘 수 없습니다."
            );
        }

        return normalized;
    }

    private String normalizeListStatus(String status) {
        String normalized =
                status == null || status.isBlank()
                        ? "all"
                        : status.trim().toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "all", "pending", "approved", "rejected" ->
                    normalized;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 all, pending, approved, rejected 중 하나여야 합니다."
            );
        };
    }

    private String normalizeReviewStatus(String status) {
        String normalized =
                status == null
                        ? ""
                        : status.trim().toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "approved", "rejected" -> normalized;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 approved 또는 rejected여야 합니다."
            );
        };
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizeNullable(String value) {
        return value == null ? "" : value.trim();
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null
                ? null
                : value.format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                );
    }

    private int resolvePageSize(
            Integer size,
            Integer pageSize
    ) {
        return size != null
                ? size
                : (pageSize != null ? pageSize : 16);
    }

    private <T> Map<String, Object> pageResponse(
            List<T> allItems,
            int page,
            int size
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        int total = allItems.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<T> items = allItems.subList(from, to);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0
                        ? 0
                        : (int) Math.ceil(
                                (double) total / safeSize
                        )
        );

        return body;
    }

    public record RevisionCreateRequest(
            String title,
            String text,
            List<String> tags,
            String reason
    ) {
    }

    public record RevisionStatusRequest(
            String status,
            String memo
    ) {
    }
}
