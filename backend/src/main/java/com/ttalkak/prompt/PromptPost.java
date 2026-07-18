package com.ttalkak.prompt;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "prompt_posts")
public class PromptPost {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long authorId;
    private String authorNickname;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String text;

    @Column(columnDefinition = "TEXT")
    private String tagsCsv;

    private long views = 0;
    private long likes = 0;
    private long comments = 0;
    private long saves = 0;
    private boolean shared = true;
    private boolean deleted = false;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    protected PromptPost() {}

    public PromptPost(Long authorId, String authorNickname, String title, String text, String tagsCsv, boolean shared) {
        this.authorId = authorId;
        this.authorNickname = authorNickname;
        this.title = title;
        this.text = text;
        this.tagsCsv = tagsCsv;
        this.shared = shared;
    }

    public Long getId() { return id; }
    public Long getAuthorId() { return authorId; }
    public String getAuthorNickname() { return authorNickname; }
    public String getTitle() { return title; }
    public String getText() { return text; }
    public String getTagsCsv() { return tagsCsv; }
    public long getViews() { return views; }
    public long getLikes() { return likes; }
    public long getComments() { return comments; }
    public long getSaves() { return saves; }
    public boolean isShared() { return shared; }
    public boolean isDeleted() { return deleted; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public void linkAuthor(Long authorId, String authorNickname) {
        if (authorId == null) {
            throw new IllegalArgumentException("authorId is required.");
        }
        this.authorId = authorId;
        if (authorNickname != null && !authorNickname.isBlank()) {
            this.authorNickname = authorNickname.trim();
        }
    }

    public void increaseViews() { this.views++; }
    public void increaseLikes() { this.likes++; }
    public void decreaseLikes() { if (this.likes > 0) this.likes--; }
    public void increaseSaves() { this.saves++; }
    public void decreaseSaves() { if (this.saves > 0) this.saves--; }
    public void increaseComments() { this.comments++; }
    public void decreaseComments() { if (this.comments > 0) this.comments--; }
    public void changeVisibility(boolean shared) { this.shared = shared; this.updatedAt = LocalDateTime.now(); }
    public void delete() { this.deleted = true; this.shared = false; this.updatedAt = LocalDateTime.now(); }
    public void restore() { this.deleted = false; this.shared = true; this.updatedAt = LocalDateTime.now(); }
    public void anonymizeAuthor() { this.authorNickname = "탈퇴한 사용자"; }
    public void update(String title, String text, String tagsCsv) {
        this.title = title;
        this.text = text;
        this.tagsCsv = tagsCsv;
        this.updatedAt = LocalDateTime.now();
    }
}
