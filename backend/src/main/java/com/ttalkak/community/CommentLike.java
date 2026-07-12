package com.ttalkak.community;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "comment_likes", uniqueConstraints = @UniqueConstraint(columnNames = {"commentId", "memberId"}))
public class CommentLike {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long commentId;
    private Long memberId;
    private LocalDateTime createdAt = LocalDateTime.now();
    protected CommentLike() {}
    public CommentLike(Long commentId, Long memberId) { this.commentId = commentId; this.memberId = memberId; }
    public Long getId() { return id; }
}
