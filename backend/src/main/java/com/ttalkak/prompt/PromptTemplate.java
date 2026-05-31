package com.ttalkak.prompt;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "prompt_template")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PromptTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(length = 500)
    private String description;

    @Column(name = "base_prompt", columnDefinition = "TEXT", nullable = false)
    private String basePrompt;

    @Column(name = "is_official", nullable = false)
    private boolean isOfficial = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public PromptTemplate(String title, String description, String basePrompt, boolean isOfficial) {
        this.title = title;
        this.description = description;
        this.basePrompt = basePrompt;
        this.isOfficial = isOfficial;
    }
}
