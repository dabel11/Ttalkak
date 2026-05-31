package com.ttalkak.prompt.dto;

import com.ttalkak.prompt.Prompt;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class PromptResponse {

    private Long id;
    private String originalText;
    private String optimizedText;
    private Float score;
    private String modelName;
    private boolean isPrivate;
    private LocalDateTime createdAt;

    public static PromptResponse from(Prompt prompt) {
        return PromptResponse.builder()
                .id(prompt.getId())
                .originalText(prompt.getOriginalText())
                .optimizedText(prompt.getOptimizedText())
                .score(prompt.getScore())
                .modelName(prompt.getModelName())
                .isPrivate(prompt.isPrivate())
                .createdAt(prompt.getCreatedAt())
                .build();
    }
}
