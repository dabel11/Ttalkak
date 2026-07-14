package com.ttalkak.admin;

import com.ttalkak.community.Report;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.community.ReportResponseMapper;
import com.ttalkak.prompt.PromptMapper;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.Tag;
import com.ttalkak.prompt.TagRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final ReportRepository reportRepository;
    private final ReportResponseMapper reportResponseMapper;
    private final PromptRepository promptRepository;
    private final TagRepository tagRepository;

    public AdminController(ReportRepository reportRepository,
                           ReportResponseMapper reportResponseMapper,
                           PromptRepository promptRepository,
                           TagRepository tagRepository) {
        this.reportRepository = reportRepository;
        this.reportResponseMapper = reportResponseMapper;
        this.promptRepository = promptRepository;
        this.tagRepository = tagRepository;
    }

    @GetMapping("/reports")
    public List<Map<String, Object>> reports(@RequestParam(required = false) String status) {
        return reportRepository.findAll().stream()
                .filter(report -> status == null
                        || status.isBlank()
                        || status.equalsIgnoreCase(report.getStatus()))
                .map(this::reportMap)
                .toList();
    }

    @PatchMapping("/reports/{id}/status")
    public ResponseEntity<?> updateReportStatus(
            @PathVariable Long id,
            @RequestBody StatusRequest request
    ) {
        Report report = reportRepository.findById(id).orElse(null);

        if (report == null) {
            return ResponseEntity.notFound().build();
        }

        report.changeStatus(
                normalizeStatus(request.status(), "reviewed"),
                request.memo()
        );

        reportRepository.save(report);
        return ResponseEntity.ok(reportMap(report));
    }

    @GetMapping("/prompts")
    public Map<String, Object> prompts(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = size != null
                ? size
                : (pageSize != null ? pageSize : 16);

        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(resolvedSize, 1), 100);

        String normalizedQuery = query == null
                ? ""
                : query.trim().toLowerCase(Locale.ROOT);

        String normalizedStatus = normalizePromptStatus(status);

        List<PromptPost> filtered = promptRepository.findAll().stream()
                .filter(prompt -> matchesPromptStatus(prompt, normalizedStatus))
                .filter(prompt -> matchesPromptQuery(prompt, normalizedQuery))
                .sorted(
                        Comparator.comparing(PromptPost::getUpdatedAt)
                                .reversed()
                                .thenComparing(
                                        PromptPost::getId,
                                        Comparator.reverseOrder()
                                )
                )
                .toList();

        int total = filtered.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<Map<String, Object>> items = filtered.subList(from, to).stream()
                .map(this::adminPromptMap)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0 ? 0 : (int) Math.ceil((double) total / safeSize)
        );

        return body;
    }

    @PatchMapping("/prompts/{id}/hide")
    public ResponseEntity<?> hidePrompt(@PathVariable Long id) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);

        if (prompt == null) {
            return ResponseEntity.notFound().build();
        }

        prompt.delete();
        promptRepository.save(prompt);

        return ResponseEntity.ok(adminPromptMap(prompt));
    }

    @PatchMapping("/prompts/{id}/restore")
    public ResponseEntity<?> restorePrompt(@PathVariable Long id) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);

        if (prompt == null) {
            return ResponseEntity.notFound().build();
        }

        prompt.restore();
        promptRepository.save(prompt);

        return ResponseEntity.ok(adminPromptMap(prompt));
    }

    @GetMapping("/tags")
    public List<Map<String, Object>> tags(
            @RequestParam(required = false) String status
    ) {
        return tagRepository.findAll().stream()
                .filter(tag -> status == null
                        || status.isBlank()
                        || status.equalsIgnoreCase(tag.getStatus()))
                .map(this::tagMap)
                .toList();
    }

    @PatchMapping("/tags/{id}/status")
    public ResponseEntity<?> updateTagStatus(
            @PathVariable Long id,
            @RequestBody StatusRequest request
    ) {
        Tag tag = tagRepository.findById(id).orElse(null);

        if (tag == null) {
            return ResponseEntity.notFound().build();
        }

        tag.changeStatus(normalizeStatus(request.status(), "approved"));
        tagRepository.save(tag);

        return ResponseEntity.ok(tagMap(tag));
    }

    private boolean matchesPromptStatus(
            PromptPost prompt,
            String status
    ) {
        return switch (status) {
            case "active" -> !prompt.isDeleted() && prompt.isShared();
            case "private" -> !prompt.isDeleted() && !prompt.isShared();
            case "deleted" -> prompt.isDeleted();
            default -> true;
        };
    }

    private boolean matchesPromptQuery(
            PromptPost prompt,
            String query
    ) {
        if (query.isBlank()) {
            return true;
        }

        return containsIgnoreCase(prompt.getTitle(), query)
                || containsIgnoreCase(prompt.getText(), query)
                || containsIgnoreCase(prompt.getAuthorNickname(), query)
                || containsIgnoreCase(prompt.getTagsCsv(), query);
    }

    private boolean containsIgnoreCase(
            String value,
            String normalizedQuery
    ) {
        return value != null
                && value.toLowerCase(Locale.ROOT).contains(normalizedQuery);
    }

    private String normalizePromptStatus(String status) {
        String normalized = status == null || status.isBlank()
                ? "all"
                : status.trim().toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "all" -> "all";
            case "active", "shared", "visible" -> "active";
            case "private", "unshared" -> "private";
            case "deleted", "hidden" -> "deleted";
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 all, active, private, deleted 중 하나여야 합니다."
            );
        };
    }

    private Map<String, Object> adminPromptMap(PromptPost prompt) {
        Map<String, Object> body = new LinkedHashMap<>(
                PromptMapper.toPromptResponse(
                        prompt,
                        null,
                        false,
                        false
                )
        );

        body.put("deleted", prompt.isDeleted());
        body.put(
                "updatedAt",
                prompt.getUpdatedAt().format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                )
        );
        body.put(
                "status",
                prompt.isDeleted()
                        ? "deleted"
                        : (prompt.isShared() ? "active" : "private")
        );

        return body;
    }

    private Map<String, Object> reportMap(Report report) {
        return reportResponseMapper.toResponse(report);
    }

    private Map<String, Object> tagMap(Tag tag) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", tag.getId());
        body.put("name", tag.getName());
        body.put("useCount", tag.getUseCount());
        body.put("count", tag.getUseCount());
        body.put("status", tag.getStatus());
        body.put(
                "createdAt",
                tag.getCreatedAt().format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                )
        );
        return body;
    }

    private String normalizeStatus(
            String status,
            String defaultStatus
    ) {
        return status == null || status.isBlank()
                ? defaultStatus
                : status.trim().toLowerCase(Locale.ROOT);
    }

    public record StatusRequest(String status, String memo) {
    }
}
