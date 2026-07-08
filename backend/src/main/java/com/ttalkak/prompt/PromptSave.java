package com.ttalkak.prompt;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "prompt_saves", uniqueConstraints = @UniqueConstraint(columnNames = {"promptId", "memberId"}))
public class PromptSave {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long promptId;
    private Long memberId;
    private LocalDateTime createdAt = LocalDateTime.now();

    protected PromptSave() {}
    public PromptSave(Long promptId, Long memberId) { this.promptId = promptId; this.memberId = memberId; }
    public Long getId() { return id; }
    public Long getPromptId() { return promptId; }
    public Long getMemberId() { return memberId; }
}
