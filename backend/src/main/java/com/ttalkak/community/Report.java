package com.ttalkak.community;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "reports")
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String targetType;
    private Long targetId;
    private Long reporterId;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Convert(converter = ReportStatusConverter.class)
    @Column(nullable = false, length = 20)
    private ReportStatus status = ReportStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String memo;

    private LocalDateTime reviewedAt;

    private LocalDateTime createdAt = LocalDateTime.now();

    protected Report() {
    }

    public Report(
            String targetType,
            Long targetId,
            Long reporterId,
            String reason
    ) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.reporterId = reporterId;
        this.reason = reason;
    }

    public Long getId() {
        return id;
    }

    public String getTargetType() {
        return targetType;
    }

    public Long getTargetId() {
        return targetId;
    }

    public Long getReporterId() {
        return reporterId;
    }

    public String getReason() {
        return reason;
    }

    public String getStatus() {
        return status.value();
    }

    public ReportStatus getStatusEnum() {
        return status;
    }

    public String getMemo() {
        return memo;
    }

    public LocalDateTime getReviewedAt() {
        return reviewedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public boolean canTransitionTo(ReportStatus nextStatus) {
        return status.canTransitionTo(nextStatus);
    }

    public void changeStatus(
            ReportStatus nextStatus,
            String memo
    ) {
        if (!canTransitionTo(nextStatus)) {
            throw new IllegalStateException(
                    "허용되지 않는 신고 상태 전이입니다."
            );
        }

        this.status = nextStatus;
        this.memo = normalizeMemo(memo);
        this.reviewedAt = LocalDateTime.now();
    }

    private String normalizeMemo(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }
}
