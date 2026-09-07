package com.ttalkak.prompt;

import java.util.Locale;

public enum TagStatus {

    PENDING("pending"),
    APPROVED("approved"),
    REJECTED("rejected"),
    DISABLED("disabled");

    private final String value;

    TagStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public boolean canTransitionTo(TagStatus nextStatus) {
        if (nextStatus == null || this == nextStatus) {
            return false;
        }

        return switch (this) {
            case PENDING ->
                    nextStatus == APPROVED
                            || nextStatus == REJECTED;

            case APPROVED ->
                    nextStatus == DISABLED;

            case DISABLED ->
                    nextStatus == APPROVED;

            case REJECTED -> false;
        };
    }

    public boolean isPubliclyVisible() {
        return this == APPROVED;
    }

    public static TagStatus fromValue(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new IllegalArgumentException(
                    "태그 상태값이 비어 있습니다."
            );
        }

        String normalized =
                rawValue.trim().toLowerCase(Locale.ROOT);

        for (TagStatus status : values()) {
            if (status.value.equals(normalized)
                    || status.name().equalsIgnoreCase(normalized)) {
                return status;
            }
        }

        throw new IllegalArgumentException(
                "지원하지 않는 태그 상태입니다: " + rawValue
        );
    }
}
