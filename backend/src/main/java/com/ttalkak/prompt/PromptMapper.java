package com.ttalkak.prompt;

import java.time.format.DateTimeFormatter;
import java.util.*;

public class PromptMapper {
    private PromptMapper() {}

    public static List<String> splitTags(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
    }

    public static String joinTags(List<String> tags) {
        if (tags == null) return "";
        return tags.stream()
                .map(Tag::normalize)
                .filter(s -> !s.isBlank())
                .distinct()
                .reduce((a, b) -> a + "," + b)
                .orElse("");
    }

    public static Map<String, Object> toPromptResponse(PromptPost prompt, Long currentMemberId, boolean isSaved, boolean isLiked) {
        Map<String, Object> author = new LinkedHashMap<>();
        author.put("id", prompt.getAuthorId());
        author.put("nickname", prompt.getAuthorNickname());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", prompt.getId());
        body.put("title", prompt.getTitle());
        body.put("text", prompt.getText());
        body.put("tags", splitTags(prompt.getTagsCsv()));
        body.put("views", prompt.getViews());
        body.put("likes", prompt.getLikes());
        body.put("comments", prompt.getComments());
        body.put("saves", prompt.getSaves());
        body.put("createdAt", prompt.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        body.put("author", author);
        body.put("owner", prompt.getAuthorNickname());
        body.put("source", currentMemberId != null && Objects.equals(prompt.getAuthorId(), currentMemberId) ? "mine" : "community");
        body.put("isMine", currentMemberId != null && Objects.equals(prompt.getAuthorId(), currentMemberId));
        body.put("isShared", prompt.isShared());
        body.put("isSaved", isSaved);
        body.put("isLiked", isLiked);
        body.put("isReported", false);
        return body;
    }
}
