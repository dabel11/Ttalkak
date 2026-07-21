package com.ttalkak.community;

import com.ttalkak.admin.AdminAuditLog;
import com.ttalkak.admin.AdminAuditLogRepository;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.member.Member;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
public class CommentController {
    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final PromptRepository promptRepository;
    private final AuthService authService;
    private final AdminAuditLogRepository adminAuditLogRepository;

    public CommentController(CommentRepository commentRepository,
                             CommentLikeRepository commentLikeRepository,
                             PromptRepository promptRepository,
                             AuthService authService,
                             AdminAuditLogRepository adminAuditLogRepository) {
        this.commentRepository = commentRepository;
        this.commentLikeRepository = commentLikeRepository;
        this.promptRepository = promptRepository;
        this.authService = authService;
        this.adminAuditLogRepository = adminAuditLogRepository;
    }

    @GetMapping("/api/prompts/{promptId}/comments")
    public List<Map<String, Object>> comments(@PathVariable Long promptId,
                                              @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireViewablePrompt(promptId, authorization);
        Long memberId = authService.currentMemberIdOrNull(authorization);
        boolean admin = isAdmin(authorization);

        return commentRepository.findByPromptIdAndParentIdIsNullOrderByLikesDescCreatedAtAsc(promptId).stream()
                .map(comment -> toResponse(comment, memberId, true, admin))
                .toList();
    }

    @PostMapping("/api/prompts/{promptId}/comments")
    public ResponseEntity<?> addComment(@PathVariable Long promptId,
                                        @RequestBody CommentRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        String nickname = authService.currentNickname(authorization);
        PromptPost prompt = requireViewablePrompt(promptId, authorization);
        Comment comment = commentRepository.save(new Comment(promptId, null, memberId, nickname, resolvedText(request)));
        prompt.increaseComments();
        promptRepository.save(prompt);
        return ResponseEntity.ok(toResponse(comment, memberId, true, isAdmin(authorization)));
    }

    @PostMapping("/api/comments/{commentId}/replies")
    public ResponseEntity<?> addReply(@PathVariable Long commentId,
                                      @RequestBody CommentRequest request,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment parent = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(parent.getPromptId(), authorization);

        if (parent.isDeleted() || parent.isHidden()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제되었거나 숨겨진 댓글에는 답글을 작성할 수 없습니다.");
        }

        String nickname = authService.currentNickname(authorization);
        Comment reply = commentRepository.save(new Comment(parent.getPromptId(), commentId, memberId, nickname, resolvedText(request)));
        promptRepository.findById(parent.getPromptId()).ifPresent(prompt -> {
            prompt.increaseComments();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(toResponse(reply, memberId, false, isAdmin(authorization)));
    }

    @PatchMapping("/api/comments/{commentId}")
    public ResponseEntity<?> updateComment(@PathVariable Long commentId,
                                           @RequestBody CommentRequest request,
                                           @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(comment.getPromptId(), authorization);
        
        if (!canManage(comment, authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "OWNER_ONLY",
                    "댓글 작성자만 수정할 수 있습니다."
            );
        }

        if (comment.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제된 댓글은 수정할 수 없습니다.");
        }

        if (comment.isHidden()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "숨김 해제 후 댓글을 수정할 수 있습니다.");
        }

        comment.updateText(resolvedText(request));
        commentRepository.save(comment);
        return ResponseEntity.ok(toResponse(comment, memberId, comment.getParentId() == null, isAdmin(authorization)));
    }

    @Transactional
    @PatchMapping("/api/admin/comments/{commentId}/hide")
    public ResponseEntity<?> hideComment(
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Member admin = authService
                .getMemberFromAuthorization(authorization)
                .orElseThrow();

        if (!isAdmin(authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_ONLY",
                    "관리자 권한이 필요합니다."
            );
        }

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));

        PromptPost prompt = promptRepository.findById(comment.getPromptId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "프롬프트를 찾을 수 없습니다."
                ));

        if (comment.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제된 댓글은 숨길 수 없습니다.");
        }

        boolean changed = comment.hide();

        if (changed) {
            commentRepository.save(comment);
            prompt.decreaseComments();
            promptRepository.save(prompt);
			recordAudit(
					admin,
					"COMMENT_HIDE",
					"COMMENT",
					commentId,
					"게시물 ID: "
							+ comment.getPromptId()
							+ ", 작성자: "
							+ auditValue(
									comment.getAuthorNickname(),
									"알 수 없음"
							)
							+ ", 댓글 내용: "
							+ auditPreview(comment.getText())
							+ ", 숨김 처리"
			);
        }

        Map<String, Object> body = new LinkedHashMap<>(
                toResponse(comment, memberId, false, true)
        );
        body.put("changed", changed);

        return ResponseEntity.ok(body);
    }

    @Transactional
    @PatchMapping("/api/admin/comments/{commentId}/unhide")
    public ResponseEntity<?> unhideComment(
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Long memberId = requireMemberId(authorization);
        Member admin = authService
                .getMemberFromAuthorization(authorization)
                .orElseThrow();

        if (!isAdmin(authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_ONLY",
                    "관리자 권한이 필요합니다."
            );
        }

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));

        PromptPost prompt = promptRepository.findById(comment.getPromptId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "프롬프트를 찾을 수 없습니다."
                ));

        if (comment.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제된 댓글은 숨김 해제할 수 없습니다.");
        }

        boolean changed = comment.unhide();

        if (changed) {
            commentRepository.save(comment);
            prompt.increaseComments();
            promptRepository.save(prompt);
			recordAudit(
					admin,
					"COMMENT_RESTORE",
					"COMMENT",
					commentId,
					"게시물 ID: "
							+ comment.getPromptId()
							+ ", 작성자: "
							+ auditValue(
									comment.getAuthorNickname(),
									"알 수 없음"
							)
							+ ", 댓글 내용: "
							+ auditPreview(comment.getText())
							+ ", 숨김 해제"
			);
        }

        Map<String, Object> body = new LinkedHashMap<>(
                toResponse(comment, memberId, false, true)
        );
        body.put("changed", changed);

        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/api/comments/{commentId}")
    public ResponseEntity<?> deleteComment(
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        requireMemberId(authorization);

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));

        requireViewablePrompt(comment.getPromptId(), authorization);

        if (!canManage(comment, authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "OWNER_ONLY",
                    "댓글 작성자만 삭제할 수 있습니다."
            );
        }

        return deleteCommentEntity(comment);
    }

    @Transactional
    @DeleteMapping("/api/admin/comments/{commentId}")
    public ResponseEntity<?> adminDeleteComment(
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        requireMemberId(authorization);
        Member admin = authService
                .getMemberFromAuthorization(authorization)
                .orElseThrow();

        if (!isAdmin(authorization)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_ONLY",
                    "관리자 권한이 필요합니다."
            );
        }

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));

        promptRepository.findById(comment.getPromptId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "프롬프트를 찾을 수 없습니다."
                ));

		Long auditPromptId = comment.getPromptId();

		String auditAuthorNickname = auditValue(
				comment.getAuthorNickname(),
				"알 수 없음"
		);

		String auditCommentPreview = auditPreview(
				comment.getText()
		);

		ResponseEntity<?> response = deleteCommentEntity(comment);

		recordAudit(
				admin,
				"COMMENT_DELETE",
				"COMMENT",
				commentId,
				"게시물 ID: "
						+ auditPromptId
						+ ", 작성자: "
						+ auditAuthorNickname
						+ ", 댓글 내용: "
						+ auditCommentPreview
						+ ", 삭제 처리"
		);

        return response;
    }

    private ResponseEntity<?> deleteCommentEntity(Comment comment) {
        Long commentId = comment.getId();
        Long parentId = comment.getParentId();
        boolean shouldDecreaseCount = isCountedComment(comment);

        if (commentRepository.countByParentId(commentId) > 0) {
            comment.softDelete();
            commentRepository.save(comment);
        } else {
            commentRepository.delete(comment);
        }

        if (parentId != null) {
            commentRepository.findById(parentId).ifPresent(parent -> {
                if (parent.isDeleted()
                        && commentRepository.countByParentId(parentId) == 0) {
                    commentRepository.delete(parent);
                }
            });
        }

        if (shouldDecreaseCount) {
            promptRepository.findById(comment.getPromptId()).ifPresent(prompt -> {
                prompt.decreaseComments();
                promptRepository.save(prompt);
            });
        }

        return ResponseEntity.ok(Map.of(
                "deleted", true,
                "id", commentId
        ));
    }

    private boolean isCountedComment(Comment comment) {
        return !comment.isDeleted() && !comment.isHidden();
    }

    @PostMapping("/api/comments/{commentId}/like")
    public ResponseEntity<?> likeComment(@PathVariable Long commentId,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(comment.getPromptId(), authorization);

        if (comment.isDeleted() || comment.isHidden()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제되었거나 숨겨진 댓글에는 좋아요를 누를 수 없습니다.");
        }

        if (!commentLikeRepository.existsByCommentIdAndMemberId(commentId, memberId)) {
            commentLikeRepository.save(new CommentLike(commentId, memberId));
            comment.increaseLikes();
            commentRepository.save(comment);
        }
        return ResponseEntity.ok(Map.of("id", commentId, "likes", comment.getLikes(), "isLiked", true));
    }

    @DeleteMapping("/api/comments/{commentId}/like")
    public ResponseEntity<?> unlikeComment(@PathVariable Long commentId,
                                           @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(comment.getPromptId(), authorization);
        commentLikeRepository.findByCommentIdAndMemberId(commentId, memberId).ifPresent(like -> {
            commentLikeRepository.delete(like);
            comment.decreaseLikes();
            commentRepository.save(comment);
        });
        return ResponseEntity.ok(Map.of("id", commentId, "likes", comment.getLikes(), "isLiked", false));
    }

    private Map<String, Object> toResponse(
            Comment comment,
            Long memberId,
            boolean includeReplies,
            boolean revealHiddenText
    ) {
        Map<String, Object> author = new LinkedHashMap<>();
        author.put("id", comment.getAuthorId());
        author.put("nickname", comment.getAuthorNickname());

        boolean hidden = comment.isHidden();
        String responseText = hidden && !revealHiddenText
                ? "관리자에 의해 숨겨진 댓글입니다."
                : comment.getText();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", comment.getId());
        body.put("promptId", comment.getPromptId());
        body.put("parentId", comment.getParentId());
        body.put("author", author);
        body.put("text", responseText);
        body.put("likes", comment.getLikes());
        body.put("edited", comment.isEdited());
        body.put("deleted", comment.isDeleted());
        body.put("hidden", hidden);
        body.put(
                "hiddenAt",
                revealHiddenText && comment.getHiddenAt() != null
                        ? comment.getHiddenAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        : null
        );
        body.put("isMine", memberId != null && memberId.equals(comment.getAuthorId()));
        body.put("isLiked", memberId != null && commentLikeRepository.existsByCommentIdAndMemberId(comment.getId(), memberId));
        body.put("isReported", false);
        body.put("createdAt", comment.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        if (includeReplies) {
            body.put(
                    "replies",
                    commentRepository.findByParentIdOrderByLikesDescCreatedAtAsc(comment.getId()).stream()
                            .map(reply -> toResponse(
                                    reply,
                                    memberId,
                                    false,
                                    revealHiddenText
                            ))
                            .toList()
            );
        }

        return body;
    }

    private PromptPost requireViewablePrompt(Long promptId, String authorization) {
        PromptPost prompt = promptRepository.findById(promptId)
                .filter(item -> !item.isDeleted())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Prompt not found."
                ));

        if (prompt.isShared()) {
            return prompt;
        }

        Long memberId = authService.currentMemberIdOrNull(authorization);
        boolean isAuthor = memberId != null
                && Objects.equals(prompt.getAuthorId(), memberId);
        boolean admin = isAdmin(authorization);

        if (!isAuthor && !admin) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Prompt not found."
            );
        }

        return prompt;
    }

    private void recordAudit(
            Member admin,
            String action,
            String targetType,
            Long targetId,
            String detail
    ) {
        String adminNickname =
                admin.getNickname() == null
                        || admin.getNickname().isBlank()
                        ? "관리자"
                        : admin.getNickname();

        AdminAuditLog auditLog = new AdminAuditLog(
                admin.getId(),
                adminNickname,
                action,
                targetType,
                targetId,
                detail
        );

        adminAuditLogRepository.save(auditLog);
    }

    private Long requireMemberId(String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "LOGIN_REQUIRED",
                    "로그인이 필요합니다."
            );
        }

        return memberId;
    }

    private boolean canManage(Comment comment, String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);

        if (memberId == null) {
            return false;
        }

        boolean isAuthor = Objects.equals(
                comment.getAuthorId(),
                memberId
        );

        return isAuthor || isAdmin(authorization);
    }

    private boolean isAdmin(String authorization) {
        return authService.getMemberFromAuthorization(authorization)
                .map(member -> "ADMIN".equalsIgnoreCase(member.getRole()))
                .orElse(false);
    }

    private String resolvedText(CommentRequest request) {
        if (request.text() != null) return request.text();
        if (request.content() != null) return request.content();
        return "";
    }

	private String auditValue(
			String value,
			String fallback
	) {
		if (value == null || value.isBlank()) {
			return fallback;
		}

		return value.trim();
	}

	private String auditPreview(String value) {
		if (value == null || value.isBlank()) {
			return "내용 없음";
		}

		String normalized = value.trim();

		if (normalized.length() <= 120) {
			return normalized;
		}

		return normalized.substring(0, 120) + "...";
	}

    public record CommentRequest(String text, String content) {}
}
