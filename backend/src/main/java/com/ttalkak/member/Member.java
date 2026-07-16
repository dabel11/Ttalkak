package com.ttalkak.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "members",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_members_auth_provider_subject",
                columnNames = {
                        "auth_provider",
                        "provider_subject"
                }
        )
)
public class Member {

    public static final String PROVIDER_LOCAL = "LOCAL";
    public static final String PROVIDER_GOOGLE = "GOOGLE";

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

    @Column(
            name = "auth_provider",
            nullable = false,
            length = 20,
            columnDefinition = "varchar(20) default 'LOCAL'"
    )
    private String authProvider = PROVIDER_LOCAL;

    @Column(name = "provider_subject", length = 255)
    private String providerSubject;

    @Column(nullable = false)
    private String role = "USER";

    @Column(
            nullable = false,
            columnDefinition = "boolean default true"
    )
    private boolean active = true;

    private LocalDateTime withdrawnAt;

    @Column(
            nullable = false,
            columnDefinition = "boolean default false"
    )
    private boolean blocked = false;

    private LocalDateTime blockedAt;

    @Column(length = 500)
    private String blockReason;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected Member() {
    }

    public Member(
            String userId,
            String password,
            String nickname,
            String name,
            LocalDate birth,
            String phone,
            String email
    ) {
        this.userId = userId;
        this.password = password;
        this.nickname = nickname;
        this.name = name;
        this.birth = birth;
        this.phone = phone;
        this.email = email;
        this.authProvider = PROVIDER_LOCAL;
        this.providerSubject = null;
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

    public static Member createGoogle(
            String userId,
            String encodedPassword,
            String nickname,
            String name,
            String email,
            String providerSubject
    ) {
        Member member = new Member(
                userId,
                encodedPassword,
                nickname,
                name,
                null,
                null,
                email
        );

        member.authProvider = PROVIDER_GOOGLE;
        member.providerSubject = providerSubject;
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
        this.authProvider = PROVIDER_LOCAL;
        this.providerSubject = null;
        this.role = "ADMIN";
        this.active = true;
        this.withdrawnAt = null;
    }

    public void synchronizeGoogleProfile(
            String name,
            String email
    ) {
        if (!isGoogleAccount()) {
            throw new IllegalStateException(
                    "Google 계정만 Google 프로필을 동기화할 수 있습니다."
            );
        }

        if (name != null && !name.isBlank()) {
            this.name = name.trim();
        }

        if (email != null && !email.isBlank()) {
            this.email = email.trim();
        }
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

    public String getAuthProvider() {
        return authProvider;
    }

    public String getProviderSubject() {
        return providerSubject;
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

    public boolean isBlocked() {
        return blocked;
    }

    public LocalDateTime getBlockedAt() {
        return blockedAt;
    }

    public String getBlockReason() {
        return blockReason;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public boolean isLocalAccount() {
        return PROVIDER_LOCAL.equalsIgnoreCase(authProvider);
    }

    public boolean isGoogleAccount() {
        return PROVIDER_GOOGLE.equalsIgnoreCase(authProvider);
    }

    public void block(String reason) {
        this.blocked = true;
        this.blockedAt = LocalDateTime.now();
        this.blockReason = reason;
    }

    public void unblock() {
        this.blocked = false;
        this.blockedAt = null;
        this.blockReason = null;
    }

    public void withdraw() {
        this.active = false;
        this.withdrawnAt = LocalDateTime.now();

        String suffix = this.id != null
                ? String.valueOf(this.id)
                : String.valueOf(System.currentTimeMillis());

        this.nickname = "withdrawn_user_" + suffix;
        this.name = "탈퇴한 사용자";
        this.phone = null;
        this.email = null;
    }
}
