package com.ttalkak.community.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class LikeResponse {
    private boolean liked;
    private long likeCount;
}
