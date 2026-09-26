package com.ttalkak.subscription;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDateTime;

@Entity
@Table(name = "guest_usage")
public class GuestUsage {
    @Id
    @Column(name = "session_uuid", length = 36, nullable = false)
    private String sessionUuid;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected GuestUsage() {}

    public GuestUsage(String sessionUuid, LocalDateTime now) {
        this.sessionUuid = sessionUuid;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public int increment(LocalDateTime now) {
        usedCount += 1;
        updatedAt = now;
        return usedCount;
    }

    public String getSessionUuid() { return sessionUuid; }
    public int getUsedCount() { return usedCount; }
}
