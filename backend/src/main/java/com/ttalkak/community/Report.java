package com.ttalkak.community;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "reports")
public class Report {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String targetType;
    private Long targetId;
    private Long reporterId;
    @Column(columnDefinition = "TEXT")
    private String reason;
    private String status = "pending";
    @Column(columnDefinition = "TEXT")
    private String memo;
    private LocalDateTime reviewedAt;
    private LocalDateTime createdAt = LocalDateTime.now();

    protected Report() {}
    public Report(String targetType, Long targetId, Long reporterId, String reason) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.reporterId = reporterId;
        this.reason = reason;
    }
    public Long getId() { return id; }
    public String getTargetType() { return targetType; }
    public Long getTargetId() { return targetId; }
    public Long getReporterId() { return reporterId; }
    public String getReason() { return reason; }
    public String getStatus() { return status; }
    public String getMemo() { return memo; }
    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void changeStatus(String status) {
        changeStatus(status, null);
    }

    public void changeStatus(String status, String memo) {
        this.status = status;
        this.memo = memo;
        this.reviewedAt = LocalDateTime.now();
    }
}

