package com.ttalkak.prompt;

import com.ttalkak.member.Member;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "conversation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id")
    private PromptTemplate template;

    @Column(length = 255)
    private String title;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public Conversation(Member member, PromptTemplate template, String title) {
        this.member = member;
        this.template = template;
        this.title = title;
    }

    public void updateTitle(String title) {
        this.title = title;
    }
}
