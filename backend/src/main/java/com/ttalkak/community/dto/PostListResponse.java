package com.ttalkak.community.dto;

import com.ttalkak.community.CommunityPost;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class PostListResponse {

    private Long id;
    private String title;
    private String authorNickname;
    private Long viewCount;
    private long likeCount;
    private boolean liked;
    private List<String> tags;
    private LocalDateTime createdAt;

    public static PostListResponse of(CommunityPost post, long likeCount, boolean liked, List<String> tags) {
        return PostListResponse.builder()
                .id(post.getId())
                .title(post.getTitle())
                .authorNickname(post.getMember().getNickname())
                .viewCount(post.getViewCount())
                .likeCount(likeCount)
                .liked(liked)
                .tags(tags)
                .createdAt(post.getCreatedAt())
                .build();
    }
}
