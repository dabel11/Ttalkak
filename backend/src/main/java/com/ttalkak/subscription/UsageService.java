package com.ttalkak.subscription;

import com.ttalkak.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

@Service
public class UsageService {
    private static final int INITIALIZATION_LOCK_STRIPES = 64;
    private final GuestUsageRepository guestUsageRepository;
    private final MemberEntitlementRepository memberEntitlementRepository;
    private final UsageRowInitializer rowInitializer;
    private final Object[] initializationLocks;
    private final int guestLimit;
    private final int freeDailyLimit;
    private final int proDailyLimit;
    private final Clock clock;
    private final ZoneId zoneId;

    @Autowired
    public UsageService(
            GuestUsageRepository guestUsageRepository,
            MemberEntitlementRepository memberEntitlementRepository,
            UsageRowInitializer rowInitializer,
            @Value("${ttalkak.usage.guest-limit:3}") int guestLimit,
            @Value("${ttalkak.usage.free-daily-limit:10}") int freeDailyLimit,
            @Value("${ttalkak.usage.pro-daily-limit:100}") int proDailyLimit,
            @Value("${ttalkak.usage.zone:Asia/Seoul}") String zone
    ) {
        this(guestUsageRepository, memberEntitlementRepository, rowInitializer,
                guestLimit, freeDailyLimit, proDailyLimit, Clock.system(ZoneId.of(zone)));
    }

    UsageService(
            GuestUsageRepository guestUsageRepository,
            MemberEntitlementRepository memberEntitlementRepository,
            UsageRowInitializer rowInitializer,
            int guestLimit,
            int freeDailyLimit,
            int proDailyLimit,
            Clock clock
    ) {
        this.guestUsageRepository = guestUsageRepository;
        this.memberEntitlementRepository = memberEntitlementRepository;
        this.rowInitializer = rowInitializer;
        this.initializationLocks = new Object[INITIALIZATION_LOCK_STRIPES];
        for (int index = 0; index < initializationLocks.length; index += 1) {
            initializationLocks[index] = new Object();
        }
        this.guestLimit = positive(guestLimit, "guest-limit");
        this.freeDailyLimit = positive(freeDailyLimit, "free-daily-limit");
        this.proDailyLimit = positive(proDailyLimit, "pro-daily-limit");
        this.clock = clock;
        this.zoneId = clock.getZone();
    }

    @Transactional
    public UsageEntitlement consume(Long memberId, String sessionUuid) {
        return reserve(memberId, sessionUuid).entitlement();
    }

    @Transactional
    public UsageReservation reserve(Long memberId, String sessionUuid) {
        return memberId == null ? reserveGuest(sessionUuid) : reserveMember(memberId);
    }

    @Transactional
    public void release(UsageReservation reservation) {
        if (reservation == null) return;
        if (reservation.memberId() == null) {
            releaseGuest(reservation.sessionUuid());
            return;
        }
        releaseMember(reservation.memberId(), reservation.usageDate());
    }

    @Transactional
    public UsageEntitlement currentMember(Long memberId) {
        return snapshot(loadMember(memberId));
    }

    @Transactional
    public UsageEntitlement applySubscription(
            Long memberId,
            String plan,
            String status,
            LocalDateTime currentPeriodEnd,
            boolean cancelAtPeriodEnd
    ) {
        MemberEntitlement entitlement = loadMember(memberId);
        entitlement.applySubscription(normalizePlan(plan), normalizeStatus(status), currentPeriodEnd, cancelAtPeriodEnd, now());
        memberEntitlementRepository.save(entitlement);
        return snapshot(entitlement);
    }

    private UsageReservation reserveGuest(String sessionUuid) {
        String normalizedUuid = normalizeSessionUuid(sessionUuid);
        LocalDateTime now = now();
        DataIntegrityViolationException collision = initializeGuest(normalizedUuid, now);
        GuestUsage usage = guestUsageRepository.findForUpdate(normalizedUuid).orElseThrow(() -> initializationFailure(
                "Guest usage row was not initialized.", collision
        ));
        if (usage.getUsedCount() >= guestLimit) {
            throw limitExceeded("FREE_TRIAL_LIMIT_EXCEEDED", "무료 체험 횟수를 모두 사용했습니다.", guestSnapshot(usage));
        }
        usage.increment(now);
        guestUsageRepository.saveAndFlush(usage);
        UsageEntitlement entitlement = guestSnapshot(usage);
        return new UsageReservation(null, normalizedUuid, null, entitlement);
    }

    private UsageReservation reserveMember(Long memberId) {
        LocalDate usageDate = LocalDate.now(clock);
        MemberEntitlement entitlement = loadMember(memberId);
        UsageEntitlement before = snapshot(entitlement);
        if ("PAST_DUE".equals(before.status())) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "SUBSCRIPTION_PAST_DUE", "결제 상태를 확인해주세요.", Map.of("usage", before.toMap()));
        }
        if (before.usedToday() >= before.dailyLimit()) {
            throw limitExceeded("DAILY_USAGE_LIMIT_EXCEEDED", "오늘의 사용량을 모두 사용했습니다.", before);
        }
        entitlement.incrementUsage(now());
        memberEntitlementRepository.saveAndFlush(entitlement);
        return new UsageReservation(memberId, null, usageDate, snapshot(entitlement));
    }

    private void releaseGuest(String sessionUuid) {
        if (sessionUuid == null) return;
        guestUsageRepository.findForUpdate(sessionUuid).ifPresent(usage -> {
            if (usage.decrement(now())) guestUsageRepository.saveAndFlush(usage);
        });
    }

    private void releaseMember(Long memberId, LocalDate usageDate) {
        if (memberId == null || usageDate == null) return;
        memberEntitlementRepository.findForUpdate(memberId).ifPresent(entitlement -> {
            if (entitlement.decrementUsage(usageDate, now())) memberEntitlementRepository.saveAndFlush(entitlement);
        });
    }

    private MemberEntitlement loadMember(Long memberId) {
        if (memberId == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "LOGIN_REQUIRED", "로그인이 필요합니다.");
        LocalDate today = LocalDate.now(clock);
        LocalDateTime now = now();
        DataIntegrityViolationException collision = initializeMember(memberId, today, now);
        MemberEntitlement entitlement = memberEntitlementRepository.findForUpdate(memberId).orElseThrow(() -> initializationFailure(
                "Member entitlement row was not initialized.", collision
        ));
        entitlement.resetUsageIfNeeded(today, now);
        return memberEntitlementRepository.save(entitlement);
    }

    private UsageEntitlement snapshot(MemberEntitlement entitlement) {
        boolean canceledPeriodEnded = "CANCELED".equals(entitlement.getStatus())
                && entitlement.isCancelAtPeriodEnd()
                && !periodIsCurrent(entitlement.getCurrentPeriodEnd());
        String effectiveStatus = canceledPeriodEnded ? "EXPIRED" : entitlement.getStatus();
        boolean effectiveCancelAtPeriodEnd = entitlement.isCancelAtPeriodEnd() && !canceledPeriodEnded;
        boolean proAccess = "PRO".equals(entitlement.getPlan()) && (
                "ACTIVE".equals(effectiveStatus) ||
                ("CANCELED".equals(effectiveStatus) && effectiveCancelAtPeriodEnd)
        );
        int limit = proAccess ? proDailyLimit : freeDailyLimit;
        int used = Math.min(entitlement.getUsedToday(), limit);
        OffsetDateTime resetAt = LocalDate.now(clock).plusDays(1).atStartOfDay(zoneId).toOffsetDateTime();
        OffsetDateTime periodEnd = entitlement.getCurrentPeriodEnd() == null
                ? null
                : entitlement.getCurrentPeriodEnd().atZone(zoneId).toOffsetDateTime();
        return new UsageEntitlement(
                entitlement.getPlan(), effectiveStatus, limit, used, Math.max(0, limit - used), resetAt,
                periodEnd, effectiveCancelAtPeriodEnd
        );
    }

    private UsageEntitlement guestSnapshot(GuestUsage usage) {
        int used = Math.min(usage.getUsedCount(), guestLimit);
        return new UsageEntitlement("GUEST", "ACTIVE", guestLimit, used, Math.max(0, guestLimit - used), null, null, false);
    }

    private ApiException limitExceeded(String code, String message, UsageEntitlement usage) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, code, message, Map.of("usage", usage.toMap()));
    }

    private String normalizeSessionUuid(String value) {
        try {
            return UUID.fromString(String.valueOf(value == null ? "" : value).trim()).toString();
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SESSION_UUID_INVALID", "비로그인 요청에는 올바른 X-Session-UUID가 필요합니다.");
        }
    }

    private boolean periodIsCurrent(LocalDateTime periodEnd) {
        return periodEnd != null && periodEnd.isAfter(now());
    }

    private DataIntegrityViolationException initializeGuest(String sessionUuid, LocalDateTime now) {
        synchronized (initializationLock(sessionUuid)) {
            try {
                rowInitializer.ensureGuest(sessionUuid, now);
                return null;
            } catch (DataIntegrityViolationException exception) {
                return exception;
            }
        }
    }

    private DataIntegrityViolationException initializeMember(Long memberId, LocalDate today, LocalDateTime now) {
        synchronized (initializationLock(memberId)) {
            try {
                rowInitializer.ensureMember(memberId, today, now);
                return null;
            } catch (DataIntegrityViolationException exception) {
                return exception;
            }
        }
    }

    private Object initializationLock(Object key) {
        return initializationLocks[Math.floorMod(key.hashCode(), initializationLocks.length)];
    }

    private RuntimeException initializationFailure(String message, DataIntegrityViolationException collision) {
        return collision == null ? new IllegalStateException(message) : collision;
    }

    private LocalDateTime now() { return LocalDateTime.now(clock); }
    private int positive(int value, String name) {
        if (value < 1) throw new IllegalArgumentException(name + " must be positive");
        return value;
    }
    private String normalizePlan(String value) {
        String normalized = String.valueOf(value == null ? "FREE" : value).trim().toUpperCase();
        return switch (normalized) {
            case "FREE", "PRO" -> normalized;
            default -> throw new IllegalArgumentException("지원하지 않는 요금제입니다.");
        };
    }
    private String normalizeStatus(String value) {
        String normalized = String.valueOf(value == null ? "ACTIVE" : value).trim().toUpperCase();
        return switch (normalized) {
            case "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED" -> normalized;
            default -> throw new IllegalArgumentException("지원하지 않는 구독 상태입니다.");
        };
    }
}
