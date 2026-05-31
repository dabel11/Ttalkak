package com.ttalkak.prompt.dto;

import com.ttalkak.prompt.PromptTemplate;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TemplateResponse {

    private Long id;
    private String title;
    private String description;
    private String basePrompt;

    public static TemplateResponse from(PromptTemplate template) {
        return TemplateResponse.builder()
                .id(template.getId())
                .title(template.getTitle())
                .description(template.getDescription())
                .basePrompt(template.getBasePrompt())
                .build();
    }
}
