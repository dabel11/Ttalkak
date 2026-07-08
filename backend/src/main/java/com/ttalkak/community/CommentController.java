package com.ttalkak.community;

import com.ttalkak.auth.AuthService;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
        Long memberId = authService.currentMemberIdOrNull(authorization);
        return commentRepository.findByPromptIdAndParentIdIsNullOrderByLikesDescCreatedAtAsc(promptId).stream()
                .map(comment -> toResponse(comment, memberId, true))
                .toList();
    }

    @PostMapping("/api/prompts/{promptId}/comments")
    public ResponseEntity<?> addComment(@PathVariable Long promptId,
                                        @RequestBody CommentRequest request,
                                        @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization);
        String nickname = authService.currentNickname(authorization);
        Comment comment = commentRepository.save(new Comment(promptId, null, memberId, nickname, resolvedText(request)));
        promptRepository.findById(promptId).ifPresent(prompt -> {
            prompt.increaseComments();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(toResponse(comment, memberId, true));
    }

    @PostMapping("/api/comments/{commentId}/replies")
    public ResponseEntity<?> addReply(@PathVariable Long commentId,
                                      @RequestBody CommentRequest request,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        Comment parent = commentRepository.findById(commentId).orElse(null);
        if (parent == null) return ResponseEntity.notFound().build();
        Long memberId = authService.currentMemberIdOrNull(authorization);
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
        Long memberId = authService.currentMemberIdOrNull(authorization);
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return ResponseEntity.notFound().build();
        comment.updateText(resolvedText(request));
        commentRepository.save(comment);
        return ResponseEntity.ok(toResponse(comment, memberId, comment.getParentId() == null));
    }

    @DeleteMapping("/api/comments/{commentId}")
    public ResponseEntity<?> deleteComment(@PathVariable Long commentId) {
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return ResponseEntity.notFound().build();
        if (commentRepository.countByParentId(commentId) > 0) {
            comment.softDelete();
            commentRepository.save(comment);
        } else {
            commentRepository.delete(comment);
        }
        promptRepository.findById(comment.getPromptId()).ifPresent(prompt -> {
            prompt.decreaseComments();
            promptRepository.save(prompt);
        });
        return ResponseEntity.ok(Map.of("deleted", true, "id", commentId));
    }

    @PostMapping("/api/comments/{commentId}/like")
    public ResponseEntity<?> likeComment(@PathVariable Long commentId,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long memberId = authService.currentMemberIdOrNull(authorization) == null ? 0L : authService.currentMemberIdOrNull(authorization);
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return ResponseEntity.notFound().build();
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
        Long memberId = authService.currentMemberIdOrNull(authorization) == null ? 0L : authService.currentMemberIdOrNull(authorization);
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return ResponseEntity.notFound().build();
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

    private String resolvedText(CommentRequest request) {
        if (request.text() != null) return request.text();
        if (request.content() != null) return request.content();
        return "";
    }

    public record CommentRequest(String text, String content) {}
}
