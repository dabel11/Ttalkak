package com.ttalkak.member;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 255)
    private String email;

    @Column(length = 255)
    private String password;

    @Column(unique = true, nullable = false, length = 50)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider", nullable = false, length = 10)
    private AuthProvider authProvider;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    public Member(String email, String password, String nickname, Role role, AuthProvider authProvider) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.role = role != null ? role : Role.USER;
        this.authProvider = authProvider != null ? authProvider : AuthProvider.LOCAL;
    }

    public void updateNickname(String nickname) {
        this.nickname = nickname;
    }
}
