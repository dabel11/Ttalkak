package com.ttalkak.subscription;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class UsageRowInitializer {
    private final GuestUsageRepository guestUsageRepository;
    private final MemberEntitlementRepository memberEntitlementRepository;

    public UsageRowInitializer(
            GuestUsageRepository guestUsageRepository,
            MemberEntitlementRepository memberEntitlementRepository
    ) {
        this.guestUsageRepository = guestUsageRepository;
        this.memberEntitlementRepository = memberEntitlementRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureGuest(String sessionUuid, LocalDateTime now) {
        if (guestUsageRepository.existsById(sessionUuid)) return;
        guestUsageRepository.saveAndFlush(new GuestUsage(sessionUuid, now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureMember(Long memberId, LocalDate today, LocalDateTime now) {
        if (memberEntitlementRepository.existsById(memberId)) return;
        memberEntitlementRepository.saveAndFlush(new MemberEntitlement(memberId, today, now));
    }
}
