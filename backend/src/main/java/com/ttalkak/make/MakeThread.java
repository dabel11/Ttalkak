package com.ttalkak.make;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "make_threads",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_make_thread_member_initial_request",
                columnNames = {"member_id", "initial_request_id"}
        )
)
public class MakeThread {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Version
    @Column(nullable = false)
    private Long version = 0L;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "initial_request_id", length = MakeApiContract.REQUEST_ID_MAX_LENGTH)
    private String initialRequestId;

    private Long folderId;
    private String title;

    @Column(columnDefinition = "TEXT")
    private String messagesJson;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    protected MakeThread() {}

    public MakeThread(Long memberId, String title, String messagesJson, Long folderId) {
        this(memberId, title, messagesJson, folderId, null);
    }

    public MakeThread(Long memberId, String title, String messagesJson, Long folderId, String initialRequestId) {
        this.memberId = memberId;
        this.title = title;
        this.messagesJson = messagesJson;
        this.folderId = folderId;
        this.initialRequestId = initialRequestId;
    }

    public Long getId() { return id; }
    public Long getVersion() { return version; }
    public Long getMemberId() { return memberId; }
    public String getInitialRequestId() { return initialRequestId; }
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
