package com.ttalkak.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "prompt_author_revision_requests")
public class PromptAuthorRevisionRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long promptId;

    @Column(nullable = false)
    private String promptTitle;

    @Column(nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 50)
    private String authorNickname;

    @Column(nullable = false)
    private Long requestedBy;

    @Column(nullable = false, length = 50)
    private String requesterNickname;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false, length = 20)
    private String status = "pending";

    private LocalDateTime acknowledgedAt;
    private LocalDateTime resolvedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected PromptAuthorRevisionRequest() {
    }

    public PromptAuthorRevisionRequest(
            Long promptId,
            String promptTitle,
            Long authorId,
            String authorNickname,
            Long requestedBy,
            String requesterNickname,
            String message
    ) {
        this.promptId = promptId;
        this.promptTitle = promptTitle;
        this.authorId = authorId;
        this.authorNickname = authorNickname;
        this.requestedBy = requestedBy;
        this.requesterNickname = requesterNickname;
        this.message = message;
    }

    public Long getId() {
        return id;
    }

    public Long getPromptId() {
        return promptId;
    }

    public String getPromptTitle() {
        return promptTitle;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public String getAuthorNickname() {
        return authorNickname;
    }

    public Long getRequestedBy() {
        return requestedBy;
    }

    public String getRequesterNickname() {
        return requesterNickname;
    }

    public String getMessage() {
        return message;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getAcknowledgedAt() {
        return acknowledgedAt;
    }

    public LocalDateTime getResolvedAt() {
        return resolvedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public boolean isPending() {
        return "pending".equalsIgnoreCase(status);
    }

    public boolean isAcknowledged() {
        return "acknowledged".equalsIgnoreCase(status);
    }

    public boolean isTerminal() {
        return "completed".equalsIgnoreCase(status)
                || "rejected".equalsIgnoreCase(status);
    }

    public void acknowledge() {
        if (!isPending()) {
            throw new IllegalStateException(
                    "대기 중인 수정 요청만 확인 처리할 수 있습니다."
            );
        }

        this.status = "acknowledged";
        this.acknowledgedAt = LocalDateTime.now();
    }

    public void complete() {
        if (isTerminal()) {
            throw new IllegalStateException(
                    "이미 처리 완료된 수정 요청입니다."
            );
        }

        if (!isAcknowledged()) {
            throw new IllegalStateException(
                    "확인한 수정 요청만 완료 처리할 수 있습니다."
            );
        }

        this.status = "completed";
        this.resolvedAt = LocalDateTime.now();
    }

    public void reject() {
        if (isTerminal()) {
            throw new IllegalStateException(
                    "이미 처리 완료된 수정 요청입니다."
            );
        }

        if (!isAcknowledged()) {
            throw new IllegalStateException(
                    "확인한 수정 요청만 거절 처리할 수 있습니다."
            );
        }

        this.status = "rejected";
        this.resolvedAt = LocalDateTime.now();
    }
}
