package com.ttalkak.community;

import com.ttalkak.auth.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportRepository reportRepository;
    private final AuthService authService;
    private final ReportResponseMapper reportResponseMapper;

    public ReportController(
            ReportRepository reportRepository,
            AuthService authService,
            ReportResponseMapper reportResponseMapper
    ) {
        this.reportRepository = reportRepository;
        this.authService = authService;
        this.reportResponseMapper = reportResponseMapper;
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
        return reportResponseMapper.toResponse(report);
    }

    public record ReportRequest(String reason) {
    }
}
