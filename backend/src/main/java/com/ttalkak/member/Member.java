package com.ttalkak.member;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "members")
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String userId;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false, unique = true, length = 50)
    private String nickname;

    @Column(nullable = false, length = 50)
    private String name;

    private LocalDate birth;
    private String phone;
    private String email;

    @Column(nullable = false)
    private String role = "USER";

    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean active = true;

    private LocalDateTime withdrawnAt;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected Member() {
    }

    public Member(String userId, String password, String nickname, String name, LocalDate birth, String phone, String email) {
        this.userId = userId;
        this.password = password;
        this.nickname = nickname;
        this.name = name;
        this.birth = birth;
        this.phone = phone;
        this.email = email;
    }

    public static Member createAdmin(
            String userId,
            String encodedPassword,
            String nickname,
            String name
    ) {
        Member member = new Member(
                userId,
                encodedPassword,
                nickname,
                name,
                null,
                null,
                null
        );
        member.role = "ADMIN";
        return member;
    }

    public void synchronizeAdminAccount(
            String encodedPassword,
            String nickname,
            String name
    ) {
        this.password = encodedPassword;
        this.nickname = nickname;
        this.name = name;
        this.role = "ADMIN";
        this.active = true;
        this.withdrawnAt = null;
    }
    public Long getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public String getPassword() {
        return password;
    }

    public String getNickname() {
        return nickname;
    }

    public String getName() {
        return name;
    }

    public LocalDate getBirth() {
        return birth;
    }

    public String getPhone() {
        return phone;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }

    public boolean isActive() {
        return active;
    }

    public LocalDateTime getWithdrawnAt() {
        return withdrawnAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void withdraw() {
        this.active = false;
        this.withdrawnAt = LocalDateTime.now();

        String suffix = this.id != null ? String.valueOf(this.id) : String.valueOf(System.currentTimeMillis());
        this.nickname = "withdrawn_user_" + suffix;
        this.name = "탈퇴한 사용자";
        this.phone = null;
        this.email = null;
    }
}