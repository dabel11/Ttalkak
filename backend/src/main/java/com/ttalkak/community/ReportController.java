package com.ttalkak.community;

import com.ttalkak.auth.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportRepository reportRepository;
    private final AuthService authService;

    public ReportController(ReportRepository reportRepository, AuthService authService) {
        this.reportRepository = reportRepository;
        this.authService = authService;
    }

    @PostMapping("/prompts/{promptId}")
    public Map<String, Object> reportPrompt(
            @PathVariable Long promptId,
            @RequestBody ReportRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Long reporterId = requireMemberId(authorization);

        Report report = reportRepository.save(new Report("prompt", promptId, reporterId, request.reason()));

        return toResponse(report);
    }

    @PostMapping("/comments/{commentId}")
    public Map<String, Object> reportComment(
            @PathVariable Long commentId,
            @RequestBody ReportRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Long reporterId = requireMemberId(authorization);

        Report report = reportRepository.save(new Report("comment", commentId, reporterId, request.reason()));

        return toResponse(report);
    }

    private Long requireMemberId(String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        return memberId;
    }

    public Map<String, Object> toResponse(Report report) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", report.getId());
        body.put("targetType", report.getTargetType());
        body.put("targetId", report.getTargetId());
        body.put("reason", report.getReason());
        body.put("status", report.getStatus());
        body.put("createdAt", report.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        return body;
    }

    public record ReportRequest(String reason) {
    }
}