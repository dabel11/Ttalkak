package com.ttalkak.admin;

import com.ttalkak.community.Report;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.community.ReportResponseMapper;
import com.ttalkak.prompt.PromptMapper;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.Tag;
import com.ttalkak.prompt.TagRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
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
                .filter(report -> status == null || status.isBlank() || status.equalsIgnoreCase(report.getStatus()))
                .map(this::reportMap)
                .toList();
    }

    @PatchMapping("/reports/{id}/status")
    public ResponseEntity<?> updateReportStatus(@PathVariable Long id, @RequestBody StatusRequest request) {
        Report report = reportRepository.findById(id).orElse(null);
        if (report == null) return ResponseEntity.notFound().build();
        report.changeStatus(normalizeStatus(request.status(), "reviewed"), request.memo());
        reportRepository.save(report);
        return ResponseEntity.ok(reportMap(report));
    }

    @PatchMapping("/prompts/{id}/hide")
    public ResponseEntity<?> hidePrompt(@PathVariable Long id) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null) return ResponseEntity.notFound().build();
        prompt.delete();
        promptRepository.save(prompt);
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, null, false, false));
    }

    @PatchMapping("/prompts/{id}/restore")
    public ResponseEntity<?> restorePrompt(@PathVariable Long id) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);
        if (prompt == null) return ResponseEntity.notFound().build();
        prompt.restore();
        promptRepository.save(prompt);
        return ResponseEntity.ok(PromptMapper.toPromptResponse(prompt, null, false, false));
    }

    @GetMapping("/tags")
    public List<Map<String, Object>> tags(@RequestParam(required = false) String status) {
        return tagRepository.findAll().stream()
                .filter(tag -> status == null || status.isBlank() || status.equalsIgnoreCase(tag.getStatus()))
                .map(this::tagMap)
                .toList();
    }

    @PatchMapping("/tags/{id}/status")
    public ResponseEntity<?> updateTagStatus(@PathVariable Long id, @RequestBody StatusRequest request) {
        Tag tag = tagRepository.findById(id).orElse(null);
        if (tag == null) return ResponseEntity.notFound().build();
        tag.changeStatus(normalizeStatus(request.status(), "approved"));
        tagRepository.save(tag);
        return ResponseEntity.ok(tagMap(tag));
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
        body.put("createdAt", tag.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        return body;
    }

    private String normalizeStatus(String status, String defaultStatus) {
        return status == null || status.isBlank() ? defaultStatus : status.trim().toLowerCase();
    }

    public record StatusRequest(String status, String memo) {}
}
