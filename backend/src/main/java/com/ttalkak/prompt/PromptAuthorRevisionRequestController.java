package com.ttalkak.prompt;

import com.ttalkak.auth.AuthService;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@RestController
public class PromptAuthorRevisionRequestController {

    private final PromptAuthorRevisionRequestRepository requestRepository;
    private final PromptRepository promptRepository;
    private final AuthService authService;

    public PromptAuthorRevisionRequestController(
            PromptAuthorRevisionRequestRepository requestRepository,
            PromptRepository promptRepository,
            AuthService authService
    ) {
        this.requestRepository = requestRepository;
        this.promptRepository = promptRepository;
        this.authService = authService;
    }

    @PostMapping(
            "/api/admin/prompts/{promptId}/author-revision-requests"
    )
    public ResponseEntity<Map<String, Object>> createRequest(
            @PathVariable Long promptId,
            @RequestBody CreateRequest request,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long adminId = requireMemberId(authorization);

        PromptPost prompt = promptRepository.findById(promptId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "프롬프트를 찾을 수 없습니다."
                ));

        if (prompt.isDeleted()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "삭제된 프롬프트에는 수정 요청을 보낼 수 없습니다."
            );
        }

        if (prompt.getAuthorId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "작성자를 확인할 수 없는 프롬프트입니다."
            );
        }

        if (requestRepository.existsByPromptIdAndStatusIn(
                promptId,
                Set.of("pending", "acknowledged")
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 처리 중인 관리자 수정 요청이 있습니다."
            );
        }

        String message = normalizeRequiredMessage(request.message());

        PromptAuthorRevisionRequest revisionRequest =
                new PromptAuthorRevisionRequest(
                        prompt.getId(),
                        prompt.getTitle(),
                        prompt.getAuthorId(),
                        normalizeNickname(
                                prompt.getAuthorNickname(),
                                "작성자"
                        ),
                        adminId,
                        normalizeNickname(
                                authService.currentNickname(
                                        authorization
                                ),
                                "관리자"
                        ),
                        message
                );

        requestRepository.save(revisionRequest);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(toResponse(revisionRequest));
    }

    @GetMapping("/api/me/author-revision-requests")
    public Map<String, Object> myReceivedRequests(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long authorId = requireMemberId(authorization);
        String normalizedStatus = normalizeListStatus(status);
        int resolvedSize = resolvePageSize(size, pageSize);

        List<Map<String, Object>> requests = requestRepository
                .findByAuthorIdOrderByCreatedAtDesc(authorId)
                .stream()
                .filter(request ->
                        "all".equals(normalizedStatus)
                                || normalizedStatus
                                .equalsIgnoreCase(
                                        request.getStatus()
                                )
                )
                .map(this::toResponse)
                .toList();

        return pageResponse(requests, page, resolvedSize);
    }

    @Transactional
    @PatchMapping(
            "/api/me/author-revision-requests/{requestId}/status"
    )
    public Map<String, Object> updateMyRequestStatus(
            @PathVariable Long requestId,
            @RequestBody StatusRequest request,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorization
    ) {
        Long authorId = requireMemberId(authorization);

        PromptAuthorRevisionRequest revisionRequest =
                requestRepository.findById(requestId)
                        .orElseThrow(() ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "수정 요청을 찾을 수 없습니다."
                                )
                        );

        if (!Objects.equals(
                revisionRequest.getAuthorId(),
                authorId
        )) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "수정 요청을 찾을 수 없습니다."
            );
        }

        String status = normalizeUpdateStatus(request.status());

        switch (status) {
            case "acknowledged" ->
                    revisionRequest.acknowledge();
            case "completed" ->
                    revisionRequest.complete();
            case "rejected" ->
                    revisionRequest.reject();
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "지원하지 않는 상태입니다."
            );
        }

        requestRepository.save(revisionRequest);

        return toResponse(revisionRequest);
    }

    private Map<String, Object> toResponse(
            PromptAuthorRevisionRequest request
    ) {
        Map<String, Object> author = new LinkedHashMap<>();
        author.put("id", request.getAuthorId());
        author.put("nickname", request.getAuthorNickname());

        Map<String, Object> requestedBy =
                new LinkedHashMap<>();
        requestedBy.put("id", request.getRequestedBy());
        requestedBy.put(
                "nickname",
                request.getRequesterNickname()
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", request.getId());
        body.put("promptId", request.getPromptId());
        body.put("promptTitle", request.getPromptTitle());
        body.put("author", author);
        body.put("requestedBy", requestedBy);
        body.put("message", request.getMessage());
        body.put("status", request.getStatus());
        body.put(
                "acknowledgedAt",
                formatDateTime(request.getAcknowledgedAt())
        );
        body.put(
                "resolvedAt",
                formatDateTime(request.getResolvedAt())
        );
        body.put(
                "createdAt",
                formatDateTime(request.getCreatedAt())
        );

        promptRepository.findById(request.getPromptId())
                .ifPresentOrElse(
                        prompt -> {
                            Map<String, Object> currentPrompt =
                                    new LinkedHashMap<>();

                            currentPrompt.put("exists", true);
                            currentPrompt.put(
                                    "title",
                                    prompt.getTitle()
                            );
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

    private String normalizeRequiredMessage(String message) {
        String normalized =
                message == null ? "" : message.trim();

        if (normalized.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "수정 요청 내용을 입력해 주세요."
            );
        }

        if (normalized.length() > 2000) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "수정 요청 내용은 2000자 이하로 입력해 주세요."
            );
        }

        return normalized;
    }

    private String normalizeNickname(
            String nickname,
            String fallback
    ) {
        if (nickname == null || nickname.isBlank()) {
            return fallback;
        }

        return nickname.trim();
    }

    private String normalizeListStatus(String status) {
        String normalized =
                status == null || status.isBlank()
                        ? "all"
                        : status.trim()
                        .toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "all",
                    "pending",
                    "acknowledged",
                    "completed",
                    "rejected" -> normalized;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 all, pending, acknowledged, completed, rejected 중 하나여야 합니다."
            );
        };
    }

    private String normalizeUpdateStatus(String status) {
        String normalized =
                status == null
                        ? ""
                        : status.trim()
                        .toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "acknowledged",
                    "completed",
                    "rejected" -> normalized;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 acknowledged, completed, rejected 중 하나여야 합니다."
            );
        };
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

    private String formatDateTime(LocalDateTime value) {
        return value == null
                ? null
                : value.format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                );
    }

    public record CreateRequest(String message) {
    }

    public record StatusRequest(String status) {
    }
}
