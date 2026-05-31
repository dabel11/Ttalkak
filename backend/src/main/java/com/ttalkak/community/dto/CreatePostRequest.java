package com.ttalkak.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;

import java.util.List;

@Getter
public class CreatePostRequest {

    @NotNull(message = "공유할 프롬프트를 선택해주세요.")
    private Long promptId;

    @NotBlank(message = "제목을 입력해주세요.")
    private String title;

    private String content;

    private List<String> tags;
}
