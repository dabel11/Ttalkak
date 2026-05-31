package com.ttalkak.prompt;

import com.ttalkak.common.response.ApiResponse;
import com.ttalkak.common.security.UserPrincipal;
import com.ttalkak.prompt.dto.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/prompts")
@RequiredArgsConstructor
public class PromptController {

    private final PromptService promptService;

    @PostMapping("/improve")
    public ApiResponse<ImproveResponse> improve(
            @Valid @RequestBody ImproveRequest request,
            @AuthenticationPrincipal(required = false) UserPrincipal user,
            HttpServletRequest httpRequest) {
        return ApiResponse.ok(promptService.improve(request, user, getClientIp(httpRequest)));
    }

    @PostMapping(value = "/improve/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter improveStream(
            @Valid @RequestBody ImproveRequest request,
            @AuthenticationPrincipal(required = false) UserPrincipal user,
            HttpServletRequest httpRequest) {

        SseEmitter emitter = new SseEmitter(180_000L);

        promptService.improveStream(request, user, getClientIp(httpRequest))
                .subscribe(
                        content -> {
                            try {
                                emitter.send(SseEmitter.event().name("content").data(content));
                            } catch (IOException e) {
                                emitter.completeWithError(e);
                            }
                        },
                        emitter::completeWithError,
                        () -> {
                            try {
                                emitter.send(SseEmitter.event().name("done").data("[DONE]"));
                                emitter.complete();
                            } catch (IOException e) {
                                emitter.completeWithError(e);
                            }
                        }
                );

        return emitter;
    }

    @PostMapping("/save")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PromptResponse> save(
            @Valid @RequestBody SavePromptRequest request,
            @AuthenticationPrincipal UserPrincipal user) {
        return ApiResponse.ok(promptService.save(request, user.getId()));
    }

    @GetMapping("/my")
    public ApiResponse<Page<PromptResponse>> getMyPrompts(
            @AuthenticationPrincipal UserPrincipal user,
            @PageableDefault(size = 16) Pageable pageable) {
        return ApiResponse.ok(promptService.getMyPrompts(user.getId(), pageable));
    }

    @GetMapping("/templates")
    public ApiResponse<List<TemplateResponse>> getTemplates() {
        return ApiResponse.ok(promptService.getTemplates());
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
