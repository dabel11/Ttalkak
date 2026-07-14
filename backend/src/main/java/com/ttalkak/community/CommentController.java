package com.ttalkak.community;

import com.ttalkak.auth.AuthService;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    public CommentController(CommentRepository commentRepository,
                             CommentLikeRepository commentLikeRepository,
                             PromptRepository promptRepository,
                             AuthService authService) {
        this.commentRepository = commentRepository;
        this.commentLikeRepository = commentLikeRepository;
        this.promptRepository = promptRepository;
        this.authService = authService;
    }

    @GetMapping("/api/prompts/{promptId}/comments")
    public List<Map<String, Object>> comments(@PathVariable Long promptId,
                                              @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireViewablePrompt(promptId, authorization);
        Long memberId = authService.currentMemberIdOrNull(authorization);
        return commentRepository.findByPromptIdAndParentIdIsNullOrderByLikesDescCreatedAtAsc(promptId).stream()
                .map(comment -> toResponse(comment, memberId, true))
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
        return ResponseEntity.ok(toResponse(comment, memberId, true));
    }

    @PostMapping("/api/comments/{commentId}/replies")
    public ResponseEntity<?> addReply(@PathVariable Long commentId,
                                      @RequestBody CommentRequest request,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment parent = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(parent.getPromptId(), authorization);
        String nickname = authService.currentNickname(authorization);
        Comment reply = commentRepository.save(new Comment(parent.getPromptId(), commentId, memberId, nickname, resolvedText(request)));
        promptRepository.findById(parent.getPromptId()).ifPresent(prompt -> {
            prompt.increaseComments();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(toResponse(reply, memberId, false));
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
            return ResponseEntity.status(403).body(Map.of("message", "댓글 수정 권한이 없습니다."));
        }
        if (comment.isDeleted()) {
            return ResponseEntity.badRequest().body(Map.of("message", "삭제된 댓글은 수정할 수 없습니다."));
        }
        comment.updateText(resolvedText(request));
        commentRepository.save(comment);
        return ResponseEntity.ok(toResponse(comment, memberId, comment.getParentId() == null));
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
            return ResponseEntity.status(403)
                    .body(Map.of("message", "댓글 삭제 권한이 없습니다."));
        }

        return deleteCommentEntity(comment);
    }

    @DeleteMapping("/api/admin/comments/{commentId}")
    public ResponseEntity<?> adminDeleteComment(
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        requireMemberId(authorization);

        if (!isAdmin(authorization)) {
            return ResponseEntity.status(403)
                    .body(Map.of("message", "관리자 권한이 필요합니다."));
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

        return deleteCommentEntity(comment);
    }

    private ResponseEntity<?> deleteCommentEntity(Comment comment) {
        Long commentId = comment.getId();
        Long parentId = comment.getParentId();
        boolean shouldDecreaseCount = !comment.isDeleted();

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

    @PostMapping("/api/comments/{commentId}/like")
    public ResponseEntity<?> likeComment(@PathVariable Long commentId,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = requireMemberId(authorization);
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        requireViewablePrompt(comment.getPromptId(), authorization);
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

    private Map<String, Object> toResponse(Comment comment, Long memberId, boolean includeReplies) {
        Map<String, Object> author = new LinkedHashMap<>();
        author.put("id", comment.getAuthorId());
        author.put("nickname", comment.getAuthorNickname());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", comment.getId());
        body.put("promptId", comment.getPromptId());
        body.put("parentId", comment.getParentId());
        body.put("author", author);
        body.put("text", comment.getText());
        body.put("likes", comment.getLikes());
        body.put("edited", comment.isEdited());
        body.put("deleted", comment.isDeleted());
        body.put("isMine", memberId != null && memberId.equals(comment.getAuthorId()));
        body.put("isLiked", memberId != null && commentLikeRepository.existsByCommentIdAndMemberId(comment.getId(), memberId));
        body.put("isReported", false);
        body.put("createdAt", comment.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        if (includeReplies) {
            body.put("replies", commentRepository.findByParentIdOrderByLikesDescCreatedAtAsc(comment.getId()).stream()
                    .map(reply -> toResponse(reply, memberId, false))
                    .toList());
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

    private Long requireMemberId(String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        if (memberId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
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

    public record CommentRequest(String text, String content) {}
}
