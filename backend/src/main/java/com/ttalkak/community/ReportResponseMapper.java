package com.ttalkak.community;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
public class ReportResponseMapper {

    private static final int PREVIEW_LENGTH = 200;

    private final MemberRepository memberRepository;
    private final PromptRepository promptRepository;
    private final CommentRepository commentRepository;

    public ReportResponseMapper(
            MemberRepository memberRepository,
            PromptRepository promptRepository,
            CommentRepository commentRepository
    ) {
        this.memberRepository = memberRepository;
        this.promptRepository = promptRepository;
        this.commentRepository = commentRepository;
    }

    public Map<String, Object> toResponse(Report report) {
        return toResponse(report, false);
    }

    public Map<String, Object> toResponse(
            Report report,
            boolean revealHiddenCommentText
    ) {
        Map<String, Object> body = new LinkedHashMap<>();

        Member reporter = memberRepository.findById(report.getReporterId())
                .orElse(null);

        body.put("id", report.getId());
        body.put("targetType", report.getTargetType());
        body.put("targetId", report.getTargetId());
        body.put("reporterId", report.getReporterId());
        body.put("reporterNickname", reporter == null ? null : reporter.getNickname());
        body.put("reason", report.getReason());
        body.put("status", report.getStatus());
        body.put("memo", report.getMemo());
        body.put("reviewedAt", formatDateTime(report.getReviewedAt()));
        body.put("createdAt", formatDateTime(report.getCreatedAt()));

        putEmptyTargetContext(body);

        String targetType = report.getTargetType() == null
                ? ""
                : report.getTargetType().trim().toLowerCase(Locale.ROOT);

        if ("prompt".equals(targetType)) {
            putPromptContext(body, report.getTargetId());
        } else if ("comment".equals(targetType)) {
            putCommentContext(body, report.getTargetId(), revealHiddenCommentText);
        }

        return body;
    }

    private void putEmptyTargetContext(Map<String, Object> body) {
        body.put("targetExists", false);
        body.put("targetDeleted", null);
        body.put("targetHidden", null);
        body.put("targetPreview", null);
        body.put("targetAuthorId", null);
        body.put("targetAuthorNickname", null);
        body.put("promptId", null);
        body.put("promptTitle", null);
        body.put("promptAuthorId", null);
        body.put("promptAuthorNickname", null);
        body.put("parentId", null);
    }

    private void putPromptContext(Map<String, Object> body, Long promptId) {
        PromptPost prompt = promptRepository.findById(promptId)
                .orElse(null);

        if (prompt == null) {
            return;
        }

        body.put("targetExists", true);
        body.put("targetDeleted", prompt.isDeleted());
        body.put("targetPreview", preview(prompt.getText()));
        body.put("targetAuthorId", prompt.getAuthorId());
        body.put("targetAuthorNickname", prompt.getAuthorNickname());
        body.put("promptId", prompt.getId());
        body.put("promptTitle", prompt.getTitle());
        body.put("promptAuthorId", prompt.getAuthorId());
        body.put("promptAuthorNickname", prompt.getAuthorNickname());
    }

    private void putCommentContext(
            Map<String, Object> body,
            Long commentId,
            boolean revealHiddenCommentText
    ) {
        Comment comment = commentRepository.findById(commentId)
                .orElse(null);

        if (comment == null) {
            return;
        }

        String targetText = comment.isHidden() && !revealHiddenCommentText
                ? "관리자에 의해 숨겨진 댓글입니다."
                : comment.getText();

        body.put("targetExists", true);
        body.put("targetDeleted", comment.isDeleted());
        body.put("targetHidden", comment.isHidden());
        body.put("targetPreview", preview(targetText));
        body.put("targetAuthorId", comment.getAuthorId());
        body.put("targetAuthorNickname", comment.getAuthorNickname());
        body.put("promptId", comment.getPromptId());
        body.put("parentId", comment.getParentId());

        PromptPost prompt = promptRepository.findById(comment.getPromptId())
                .orElse(null);

        if (prompt == null) {
            return;
        }

        body.put("promptTitle", prompt.getTitle());
        body.put("promptAuthorId", prompt.getAuthorId());
        body.put("promptAuthorNickname", prompt.getAuthorNickname());
    }

    private String preview(String text) {
        if (text == null) {
            return null;
        }

        String normalized = text.replaceAll("\\s+", " ").trim();

        if (normalized.length() <= PREVIEW_LENGTH) {
            return normalized;
        }

        return normalized.substring(0, PREVIEW_LENGTH) + "…";
    }

    private String formatDateTime(java.time.LocalDateTime value) {
        return value == null
                ? null
                : value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
}
