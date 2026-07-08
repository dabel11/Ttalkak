package com.ttalkak.prompt;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "tags")
public class Tag {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true)
    private String name;
    private long useCount = 0;
    private String status = "approved";
    private LocalDateTime createdAt = LocalDateTime.now();

    protected Tag() {}
    public Tag(String name) { this.name = normalize(name); }
    public Long getId() { return id; }
    public String getName() { return name; }
    public long getUseCount() { return useCount; }
    public String getStatus() { return status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void increaseUseCount() { this.useCount++; }
    public static String normalize(String raw) { return raw == null ? "" : raw.trim().replace("#", "").toLowerCase(); }
}
