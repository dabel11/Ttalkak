package com.ttalkak.make;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "make_folders")
public class MakeFolder {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long memberId;
    private String name;
    private LocalDateTime createdAt = LocalDateTime.now();

    protected MakeFolder() {}
    public MakeFolder(Long memberId, String name) { this.memberId = memberId; this.name = name; }
    public Long getId() { return id; }
    public Long getMemberId() { return memberId; }
    public String getName() { return name; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void updateName(String name) { this.name = name; }
}
