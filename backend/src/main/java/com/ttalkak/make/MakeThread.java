package com.ttalkak.make;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "make_threads")
public class MakeThread {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Version
    @Column(nullable = false)
    private Long version = 0L;

    @Column(nullable = false)
    private Long memberId;

    private Long folderId;
    private String title;

    @Column(columnDefinition = "TEXT")
    private String messagesJson;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    protected MakeThread() {}

    public MakeThread(Long memberId, String title, String messagesJson, Long folderId) {
        this.memberId = memberId;
        this.title = title;
        this.messagesJson = messagesJson;
        this.folderId = folderId;
    }

    public Long getId() { return id; }
    public Long getVersion() { return version; }
    public Long getMemberId() { return memberId; }
    public Long getFolderId() { return folderId; }
    public String getTitle() { return title; }
    public String getMessagesJson() { return messagesJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public void update(String title, String messagesJson, Long folderId) {
        this.title = title;
        this.messagesJson = messagesJson;
        this.folderId = folderId;
        this.updatedAt = LocalDateTime.now();
    }

    public void moveFolder(Long folderId) {
        this.folderId = folderId;
        this.updatedAt = LocalDateTime.now();
    }
}
