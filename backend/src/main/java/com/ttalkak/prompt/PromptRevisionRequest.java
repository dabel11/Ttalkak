package com.ttalkak.prompt;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "prompt_revision_requests")
public class PromptRevisionRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long promptId;

    @Column(nullable = false)
    private Long requesterId;

    @Column(nullable = false, length = 50)
    private String requesterNickname;

    @Column(nullable = false)
    private String originalTitle;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String originalText;

    @Column(columnDefinition = "TEXT")
    private String originalTagsCsv;

    @Column(nullable = false)
    private String proposedTitle;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String proposedText;

    @Column(columnDefinition = "TEXT")
    private String proposedTagsCsv;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(nullable = false, length = 20)
    private String status = "pending";

    @Column(columnDefinition = "TEXT")
    private String adminMemo;

    private Long reviewedBy;
    private LocalDateTime reviewedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected PromptRevisionRequest() {
    }

    public PromptRevisionRequest(
            Long promptId,
            Long requesterId,
            String requesterNickname,
            String originalTitle,
            String originalText,
            String originalTagsCsv,
            String proposedTitle,
            String proposedText,
            String proposedTagsCsv,
            String reason
    ) {
        this.promptId = promptId;
        this.requesterId = requesterId;
        this.requesterNickname = requesterNickname;
        this.originalTitle = originalTitle;
        this.originalText = originalText;
        this.originalTagsCsv = originalTagsCsv;
        this.proposedTitle = proposedTitle;
        this.proposedText = proposedText;
        this.proposedTagsCsv = proposedTagsCsv;
        this.reason = reason;
    }

    public Long getId() {
        return id;
    }

    public Long getPromptId() {
        return promptId;
    }

    public Long getRequesterId() {
        return requesterId;
    }

    public String getRequesterNickname() {
        return requesterNickname;
    }

    public String getOriginalTitle() {
        return originalTitle;
    }

    public String getOriginalText() {
        return originalText;
    }

    public String getOriginalTagsCsv() {
        return originalTagsCsv;
    }

    public String getProposedTitle() {
        return proposedTitle;
    }

    public String getProposedText() {
        return proposedText;
    }

    public String getProposedTagsCsv() {
        return proposedTagsCsv;
    }

    public String getReason() {
        return reason;
    }

    public String getStatus() {
        return status;
    }

    public String getAdminMemo() {
        return adminMemo;
    }

    public Long getReviewedBy() {
        return reviewedBy;
    }

    public LocalDateTime getReviewedAt() {
        return reviewedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public boolean isPending() {
        return "pending".equalsIgnoreCase(status);
    }

    public void approve(Long reviewerId, String memo) {
        this.status = "approved";
        this.adminMemo = memo;
        this.reviewedBy = reviewerId;
        this.reviewedAt = LocalDateTime.now();
    }

    public void reject(Long reviewerId, String memo) {
        this.status = "rejected";
        this.adminMemo = memo;
        this.reviewedBy = reviewerId;
        this.reviewedAt = LocalDateTime.now();
    }
}
