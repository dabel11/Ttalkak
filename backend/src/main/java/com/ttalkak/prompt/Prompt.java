package com.ttalkak.prompt;

import com.ttalkak.member.Member;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "prompt")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Prompt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id")
    private Conversation conversation;

    @Column(name = "original_text", columnDefinition = "TEXT")
    private String originalText;

    @Column(name = "optimized_text", columnDefinition = "TEXT")
    private String optimizedText;

    @Column
    private Float score;

    @Column(name = "model_name", length = 100)
    private String modelName;

    @Column(name = "is_private", nullable = false)
    private boolean isPrivate = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Builder
    public Prompt(Member member, Conversation conversation, String originalText,
                  String optimizedText, Float score, String modelName, boolean isPrivate) {
        this.member = member;
        this.conversation = conversation;
        this.originalText = originalText;
        this.optimizedText = optimizedText;
        this.score = score;
        this.modelName = modelName;
        this.isPrivate = isPrivate;
    }

    public void makePublic() {
        this.isPrivate = false;
    }

    public void makePrivate() {
        this.isPrivate = true;
    }
}
