package com.ttalkak.subscription;

import java.time.LocalDate;

public record UsageReservation(
        Long memberId,
        String sessionUuid,
        LocalDate usageDate,
        UsageEntitlement entitlement
) {}
