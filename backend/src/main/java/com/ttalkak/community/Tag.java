package com.ttalkak.community;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "tag")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 50)
    private String name;

    @Column(name = "use_count", nullable = false)
    private Long useCount = 0L;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public Tag(String name) {
        this.name = name.toLowerCase();
        this.useCount = 0L;
    }

    public void incrementUseCount() {
        this.useCount++;
    }

    public void decrementUseCount() {
        if (this.useCount > 0) this.useCount--;
    }
}
