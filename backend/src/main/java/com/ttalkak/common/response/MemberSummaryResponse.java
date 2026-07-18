package com.ttalkak.common.response;

public record MemberSummaryResponse(
        Long id,
        String nickname
) {
    public static MemberSummaryResponse of(
            Long id,
            String nickname
    ) {
        if (id == null && nickname == null) {
            return null;
        }

        return new MemberSummaryResponse(id, nickname);
    }
}
