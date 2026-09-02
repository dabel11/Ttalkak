package com.ttalkak.community;

import java.util.Locale;

public enum ReportStatus {

    PENDING("pending"),
    REVIEWED("reviewed"),
    RESOLVED("resolved"),
    DISMISSED("dismissed");

    private final String value;

    ReportStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public boolean canTransitionTo(ReportStatus nextStatus) {
        if (nextStatus == null || this == nextStatus) {
            return false;
        }

        return switch (this) {
            case PENDING ->
                    nextStatus == REVIEWED
                            || nextStatus == RESOLVED
                            || nextStatus == DISMISSED;

            case REVIEWED ->
                    nextStatus == RESOLVED
                            || nextStatus == DISMISSED;

            case RESOLVED, DISMISSED -> false;
        };
    }

    public boolean isTerminal() {
        return this == RESOLVED || this == DISMISSED;
    }

    public static ReportStatus fromValue(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new IllegalArgumentException(
                    "신고 상태값이 비어 있습니다."
            );
        }

        String normalized =
                rawValue.trim().toLowerCase(Locale.ROOT);

        for (ReportStatus status : values()) {
            if (status.value.equals(normalized)
                    || status.name().equalsIgnoreCase(normalized)) {
                return status;
            }
        }

        throw new IllegalArgumentException(
                "지원하지 않는 신고 상태입니다: " + rawValue
        );
    }
}
