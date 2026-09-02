package com.ttalkak.prompt;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "tags")
public class Tag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    private long useCount = 0;

    @Convert(converter = TagStatusConverter.class)
    @Column(nullable = false, length = 20)
    private TagStatus status = TagStatus.APPROVED;

    private LocalDateTime createdAt = LocalDateTime.now();

    protected Tag() {
    }

    public Tag(String name) {
        this(name, TagStatus.APPROVED);
    }

    private Tag(String name, TagStatus status) {
        this.name = normalize(name);
        this.status = status;
    }

    public static Tag proposal(String name) {
        return new Tag(name, TagStatus.PENDING);
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public long getUseCount() {
        return useCount;
    }

    public String getStatus() {
        return status.value();
    }

    public TagStatus getStatusEnum() {
        return status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void increaseUseCount() {
        this.useCount++;
    }

    public boolean canTransitionTo(TagStatus nextStatus) {
        return status.canTransitionTo(nextStatus);
    }

    public void changeStatus(TagStatus nextStatus) {
        if (!canTransitionTo(nextStatus)) {
            throw new IllegalStateException(
                    "허용되지 않는 태그 상태 전이입니다."
            );
        }

        this.status = nextStatus;
    }

    public static String normalize(String raw) {
        return raw == null
                ? ""
                : raw.trim()
                        .replace("#", "")
                        .toLowerCase();
    }
}
