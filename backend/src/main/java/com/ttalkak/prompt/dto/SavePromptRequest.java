package com.ttalkak.prompt.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class SavePromptRequest {

    private Long conversationId;

    @NotBlank(message = "원본 프롬프트를 입력해주세요.")
    private String originalText;

    @NotBlank(message = "개선된 프롬프트를 입력해주세요.")
    private String optimizedText;

    private Float score;
    private String modelName;
    private boolean isPrivate = true;
}
