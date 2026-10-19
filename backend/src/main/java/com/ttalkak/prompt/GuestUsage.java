package com.ttalkak.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "guest_usage")
public class GuestUsage {
    @Id
    @Column(length = 64, nullable = false)
    private String sessionUuidHash;

    @Column(nullable = false)
    private int usageCount;

    @Column(nullable = false)
    private int reservedCount;

    @Version
    private Long version;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected GuestUsage() {}

    GuestUsage(String sessionUuidHash) {
        this.sessionUuidHash = sessionUuidHash;
    }

    public int getUsageCount() {
        return usageCount;
    }

    public int getReservedCount() {
        return reservedCount;
    }

    void reserve() {
        reservedCount++;
    }

    void complete() {
        reservedCount--;
        usageCount++;
    }

    void release() {
        reservedCount--;
    }
}
