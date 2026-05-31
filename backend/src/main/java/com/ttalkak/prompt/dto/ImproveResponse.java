package com.ttalkak.prompt.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class ImproveResponse {

    private Long conversationId;
    private String improved;
    private Float score;
    private List<String> changes;
}
