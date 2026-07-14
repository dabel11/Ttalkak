package com.ttalkak.community;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "comments")
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long promptId;
    private Long parentId;
    private Long authorId;
    private String authorNickname;

    @Column(columnDefinition = "TEXT")
    private String text;

    private long likes = 0;
    private boolean edited = false;
    private boolean deleted = false;
    private boolean hidden = false;

    private LocalDateTime hiddenAt;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    protected Comment() {
    }

    public Comment(
            Long promptId,
            Long parentId,
            Long authorId,
            String authorNickname,
            String text
    ) {
        this.promptId = promptId;
        this.parentId = parentId;
        this.authorId = authorId;
        this.authorNickname = authorNickname;
        this.text = text;
    }

    public Long getId() {
        return id;
    }

    public Long getPromptId() {
        return promptId;
    }

    public Long getParentId() {
        return parentId;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public String getAuthorNickname() {
        return authorNickname;
    }

    public String getText() {
        return text;
    }

    public long getLikes() {
        return likes;
    }

    public boolean isEdited() {
        return edited;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public boolean isHidden() {
        return hidden;
    }

    public LocalDateTime getHiddenAt() {
        return hiddenAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void updateText(String text) {
        this.text = text;
        this.edited = true;
        this.updatedAt = LocalDateTime.now();
    }

    public void softDelete() {
        this.deleted = true;
        this.hidden = false;
        this.hiddenAt = null;
        this.text = "삭제된 댓글입니다.";
        this.updatedAt = LocalDateTime.now();
    }

    public boolean hide() {
        if (this.deleted || this.hidden) {
            return false;
        }

        this.hidden = true;
        this.hiddenAt = LocalDateTime.now();
        this.updatedAt = this.hiddenAt;

        return true;
    }

    public boolean unhide() {
        if (this.deleted || !this.hidden) {
            return false;
        }

        this.hidden = false;
        this.hiddenAt = null;
        this.updatedAt = LocalDateTime.now();

        return true;
    }

    public void increaseLikes() {
        this.likes++;
    }

    public void decreaseLikes() {
        if (this.likes > 0) {
            this.likes--;
        }
    }
}
