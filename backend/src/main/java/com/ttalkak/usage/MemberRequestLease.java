package com.ttalkak.usage;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "member_request_lease")
public class MemberRequestLease {
    @Id
    private Long memberId;
    @Column(length = 36)
    private String permitId;
    private Instant expiresAt;
    @Column(nullable = false)
    private boolean usageUncertain;

    protected MemberRequestLease() {}
    public MemberRequestLease(Long memberId) { this.memberId = memberId; }
    public boolean activeAt(Instant now) { return permitId != null && expiresAt.isAfter(now); }
    public boolean abandoned() { return permitId != null; }
    public boolean owns(String id) { return id.equals(permitId); }
    public boolean usageUncertain() { return usageUncertain; }
    public void uncertain() { usageUncertain = true; }
    public void acquire(String id, Instant end) { permitId = id; expiresAt = end; }
    public void release() { permitId = null; expiresAt = null; }
}
