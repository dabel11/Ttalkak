package com.ttalkak.community.dto;

import com.ttalkak.community.Tag;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TagResponse {

    private Long id;
    private String name;
    private Long useCount;

    public static TagResponse from(Tag tag) {
        return TagResponse.builder()
                .id(tag.getId())
                .name(tag.getName())
                .useCount(tag.getUseCount())
                .build();
    }
}
