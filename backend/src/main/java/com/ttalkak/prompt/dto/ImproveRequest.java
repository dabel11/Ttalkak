package com.ttalkak.prompt.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

@Getter
public class ImproveRequest {

    private Long conversationId;

    @NotBlank(message = "프롬프트를 입력해주세요.")
    private String prompt;

    // coding, email, analysis 등
    private String goal;

    // gpt-4o, claude-opus-4-5-20251001 등 (null이면 기본 모델 사용)
    private String modelName;
}
