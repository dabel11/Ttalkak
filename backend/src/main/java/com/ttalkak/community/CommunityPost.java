package com.ttalkak.community;

import com.ttalkak.member.Member;
import com.ttalkak.prompt.Prompt;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "community_post")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CommunityPost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prompt_id", nullable = false)
    private Prompt prompt;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PostStatus status = PostStatus.ACTIVE;

    @Column(name = "view_count", nullable = false)
    private Long viewCount = 0L;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Builder
    public CommunityPost(Member member, Prompt prompt, String title, String content) {
        this.member = member;
        this.prompt = prompt;
        this.title = title;
        this.content = content;
        this.status = PostStatus.ACTIVE;
        this.viewCount = 0L;
    }

    public void incrementViewCount() {
        this.viewCount++;
    }

    public void hide() {
        this.status = PostStatus.HIDDEN;
    }

    public void delete() {
        this.status = PostStatus.DELETED;
    }
}
