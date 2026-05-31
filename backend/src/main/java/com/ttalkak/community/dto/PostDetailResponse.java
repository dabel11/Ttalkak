package com.ttalkak.community.dto;

import com.ttalkak.community.CommunityPost;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class PostDetailResponse {

    private Long id;
    private String title;
    private String content;
    private String authorNickname;
    private Long authorId;
    private Long viewCount;
    private long likeCount;
    private boolean liked;
    private List<String> tags;
    private String optimizedText;
    private String originalText;
    private Float score;
    private LocalDateTime createdAt;

    public static PostDetailResponse of(CommunityPost post, long likeCount, boolean liked, List<String> tags) {
        return PostDetailResponse.builder()
                .id(post.getId())
                .title(post.getTitle())
                .content(post.getContent())
                .authorNickname(post.getMember().getNickname())
                .authorId(post.getMember().getId())
                .viewCount(post.getViewCount())
                .likeCount(likeCount)
                .liked(liked)
                .tags(tags)
                .optimizedText(post.getPrompt().getOptimizedText())
                .originalText(post.getPrompt().getOriginalText())
                .score(post.getPrompt().getScore())
                .createdAt(post.getCreatedAt())
                .build();
    }
}
