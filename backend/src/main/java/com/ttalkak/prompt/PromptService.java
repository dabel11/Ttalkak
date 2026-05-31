package com.ttalkak.prompt;

import com.ttalkak.common.exception.CustomException;
import com.ttalkak.common.exception.ErrorCode;
import com.ttalkak.common.ratelimit.RateLimitService;
import com.ttalkak.common.security.UserPrincipal;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberService;
import com.ttalkak.prompt.ai.AiService;
import com.ttalkak.prompt.dto.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PromptService {

    private final AiService aiService;
    private final RateLimitService rateLimitService;
    private final MemberService memberService;
    private final ConversationRepository conversationRepository;
    private final ConversationMessageRepository messageRepository;
    private final PromptRepository promptRepository;
    private final PromptTemplateRepository templateRepository;

    @Transactional
    public ImproveResponse improve(ImproveRequest request, UserPrincipal user, String clientIp) {
        if (user == null && !rateLimitService.isAllowed(clientIp)) {
            throw new CustomException(ErrorCode.RATE_LIMIT_EXCEEDED);
        }

        Conversation conversation = resolveConversation(request.getConversationId(), user);
        List<Map<String, String>> history = loadHistory(conversation);

        AiService.AiResult result = aiService.improve(history, request.getPrompt(),
                request.getGoal(), request.getModelName());

        saveMessages(conversation, request.getPrompt(), result.improved());

        return ImproveResponse.builder()
                .conversationId(conversation != null ? conversation.getId() : null)
                .improved(result.improved())
                .score(result.score())
                .changes(result.changes())
                .build();
    }

    public Flux<String> improveStream(ImproveRequest request, UserPrincipal user, String clientIp) {
        if (user == null && !rateLimitService.isAllowed(clientIp)) {
            throw new CustomException(ErrorCode.RATE_LIMIT_EXCEEDED);
        }

        Conversation conversation = resolveConversation(request.getConversationId(), user);
        List<Map<String, String>> history = loadHistory(conversation);

        StringBuilder accumulated = new StringBuilder();
        Flux<String> stream = aiService.improveStream(history, request.getPrompt(),
                request.getGoal(), request.getModelName());

        return stream
                .doOnNext(accumulated::append)
                .doOnComplete(() -> {
                    if (conversation != null) {
                        try {
                            saveMessagesAsync(conversation, request.getPrompt(), accumulated.toString());
                        } catch (Exception e) {
                            log.warn("Failed to save streaming conversation messages", e);
                        }
                    }
                });
    }

    @Transactional
    public PromptResponse save(SavePromptRequest request, Long memberId) {
        Member member = memberService.findById(memberId);
        Conversation conversation = null;
        if (request.getConversationId() != null) {
            conversation = conversationRepository.findByIdAndMemberId(
                    request.getConversationId(), memberId).orElse(null);
        }

        Prompt prompt = Prompt.builder()
                .member(member)
                .conversation(conversation)
                .originalText(request.getOriginalText())
                .optimizedText(request.getOptimizedText())
                .score(request.getScore())
                .modelName(request.getModelName())
                .isPrivate(request.isPrivate())
                .build();

        return PromptResponse.from(promptRepository.save(prompt));
    }

    public Page<PromptResponse> getMyPrompts(Long memberId, Pageable pageable) {
        return promptRepository.findByMemberId(memberId, pageable)
                .map(PromptResponse::from);
    }

    public List<TemplateResponse> getTemplates() {
        return templateRepository.findByIsOfficialTrueOrderByIdAsc().stream()
                .map(TemplateResponse::from)
                .collect(Collectors.toList());
    }

    private Conversation resolveConversation(Long conversationId, UserPrincipal user) {
        if (user == null) return null; // 비로그인: 대화 기록 없음

        if (conversationId != null) {
            return conversationRepository.findByIdAndMemberId(conversationId, user.getId())
                    .orElseThrow(() -> new CustomException(ErrorCode.CONVERSATION_NOT_FOUND));
        }

        Member member = memberService.findById(user.getId());
        Conversation conversation = Conversation.builder()
                .member(member)
                .title("새 대화")
                .build();
        return conversationRepository.save(conversation);
    }

    private List<Map<String, String>> loadHistory(Conversation conversation) {
        if (conversation == null) return List.of();
        return messageRepository.findTop10ByConversationIdOrderByCreatedAtAsc(conversation.getId())
                .stream()
                .map(msg -> Map.of(
                        "role", msg.getRole().name().toLowerCase(),
                        "content", msg.getContent()))
                .collect(Collectors.toList());
    }

    @Transactional
    public void saveMessages(Conversation conversation, String userPrompt, String assistantResponse) {
        if (conversation == null) return;
        messageRepository.save(ConversationMessage.builder()
                .conversation(conversation)
                .role(MessageRole.USER)
                .content(userPrompt)
                .build());
        messageRepository.save(ConversationMessage.builder()
                .conversation(conversation)
                .role(MessageRole.ASSISTANT)
                .content(assistantResponse)
                .build());
    }

    @Transactional
    public void saveMessagesAsync(Conversation conversation, String userPrompt, String assistantResponse) {
        saveMessages(conversation, userPrompt, assistantResponse);
    }
}
