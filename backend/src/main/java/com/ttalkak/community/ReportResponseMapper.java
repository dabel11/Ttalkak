package com.ttalkak.community;

import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.springframework.stereotype.Component;
import com.ttalkak.common.response.MemberSummaryResponse;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
        body.put("reporter", MemberSummaryResponse.of(report.getReporterId(), reporter == null ? null : reporter.getNickname()));
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

    private boolean viewableBy(PromptPost prompt, Long viewerId) {
        return prompt != null && !prompt.isDeleted()
                && (prompt.isShared() || Objects.equals(prompt.getAuthorId(), viewerId));
    }

    public void requireReportablePrompt(Long promptId, Long reporterId) {
        PromptPost prompt = promptRepository.findById(promptId).orElse(null);
        if (!viewableBy(prompt, reporterId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "신고할 게시글을 찾을 수 없습니다.");
        }
    }

    public void requireReportableComment(Long commentId, Long reporterId) {
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null || comment.isDeleted() || comment.isHidden()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "신고할 댓글을 찾을 수 없습니다.");
        }
        requireReportablePrompt(comment.getPromptId(), reporterId);
    }

    /**
     * Report history can outlive public visibility. Redact target text, title,
     * author and comment context when a different author makes it private.
     * Admin reports still use the existing toResponse() method.
     */
    public Map<String, Object> toResponseForReporter(Report report, Long reporterId) {
        Map<String, Object> body = toResponse(report);
        // Moderation notes are internal-only, including for the original reporter.
        body.put("memo", null);
        PromptPost prompt = null;
        boolean unavailableComment = false;
        String kind = report.getTargetType() == null
                ? "" : report.getTargetType().trim().toLowerCase(Locale.ROOT);
        if ("prompt".equals(kind)) {
            prompt = promptRepository.findById(report.getTargetId()).orElse(null);
        } else if ("comment".equals(kind)) {
            Comment comment = commentRepository.findById(report.getTargetId()).orElse(null);
            if (comment != null) {
                prompt = promptRepository.findById(comment.getPromptId()).orElse(null);
                unavailableComment = comment.isDeleted() || comment.isHidden();
            } else {
                unavailableComment = true;
            }
        }
        if (!viewableBy(prompt, reporterId)) {
            for (String field : new String[]{"targetPreview", "author", "promptTitle",
                    "promptContent", "promptAuthor", "commentContent",
                    "promptId", "parentId", "targetExists", "targetDeleted", "targetHidden"}) {
                body.put(field, null);
            }
        }
        // A deleted or hidden comment is not readable just because its
        // parent post remains public. Keep report status/reason but remove
        // the former comment author's identity and content references.
        if (unavailableComment) {
            for (String field : new String[]{"targetPreview", "commentContent", "author", "parentId"}) {
                body.put(field, null);
            }
        }
        return body;
    }

    private void putEmptyTargetContext(Map<String, Object> body) {
        body.put("targetExists", false);
        body.put("targetDeleted", null);
        body.put("targetHidden", null);
        body.put("targetPreview", null);
        body.put("author", null);
        body.put("promptId", null);
        body.put("promptTitle", null);
        body.put("promptAuthor", null);
        body.put("parentId", null);
        body.put("promptContent", null);
        body.put("commentContent", null);
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
        body.put("author", MemberSummaryResponse.of(prompt.getAuthorId(), prompt.getAuthorNickname()));
        body.put("promptId", prompt.getId());
        body.put("promptTitle", prompt.getTitle());
        body.put("promptContent", prompt.getText());
        body.put("promptAuthor", MemberSummaryResponse.of(prompt.getAuthorId(), prompt.getAuthorNickname()));
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
        body.put("commentContent", targetText);
        body.put("author", MemberSummaryResponse.of(comment.getAuthorId(), comment.getAuthorNickname()));
        body.put("promptId", comment.getPromptId());
        body.put("parentId", comment.getParentId());

        PromptPost prompt = promptRepository.findById(comment.getPromptId())
                .orElse(null);

        if (prompt == null) {
            return;
        }

        body.put("promptTitle", prompt.getTitle());
        body.put("promptAuthor", MemberSummaryResponse.of(prompt.getAuthorId(), prompt.getAuthorNickname()));
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
