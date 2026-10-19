package com.ttalkak.usage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(name = "member_token_usage",
        uniqueConstraints = @UniqueConstraint(name = "uk_member_token_usage_request",
                columnNames = {"member_id", "request_key"}),
        indexes = @Index(name = "idx_member_token_usage_period",
                columnList = "member_id,occurred_at"))
public class MemberTokenUsage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "request_key", nullable = false, length = 128)
    private String requestKey;

    @Column(name = "input_tokens", nullable = false)
    private long inputTokens;

    @Column(name = "output_tokens", nullable = false)
    private long outputTokens;

    @Column(name = "total_tokens", nullable = false)
    private long totalTokens;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "usage_details_json", columnDefinition = "TEXT")
    private String usageDetailsJson;

    protected MemberTokenUsage() {}

    MemberTokenUsage(Long memberId, String requestKey, TokenCounts counts, Instant occurredAt) {
        this(memberId, requestKey, counts, occurredAt, null);
    }

    MemberTokenUsage(Long memberId, String requestKey, TokenCounts counts, Instant occurredAt, String details) {
        this.usageDetailsJson = details;
        this.memberId = memberId;
        this.requestKey = requestKey;
        this.inputTokens = counts.inputTokens();
        this.outputTokens = counts.outputTokens();
        this.totalTokens = counts.totalTokens();
        this.occurredAt = occurredAt;
    }

    public String getUsageDetailsJson() { return usageDetailsJson; }
    public Long getMemberId() { return memberId; }
    public String getRequestKey() { return requestKey; }
    public long getInputTokens() { return inputTokens; }
    public long getOutputTokens() { return outputTokens; }
    public long getTotalTokens() { return totalTokens; }
    public Instant getOccurredAt() { return occurredAt; }
}
