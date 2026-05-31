package com.ttalkak.prompt.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.common.exception.CustomException;
import com.ttalkak.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${ai.openai.api-key:}")
    private String openaiApiKey;

    @Value("${ai.openai.base-url}")
    private String openaiBaseUrl;

    @Value("${ai.openai.default-model}")
    private String openaiDefaultModel;

    @Value("${ai.anthropic.api-key:}")
    private String anthropicApiKey;

    @Value("${ai.anthropic.base-url}")
    private String anthropicBaseUrl;

    @Value("${ai.anthropic.default-model}")
    private String anthropicDefaultModel;

    @Value("${ai.anthropic.version}")
    private String anthropicVersion;

    private static final String SYSTEM_PROMPT = """
            당신은 AI 프롬프트 최적화 전문가입니다. 사용자가 제공하는 프롬프트를 더 구체적이고 명확하며 효과적으로 개선해주세요.

            반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
            {
              "improved": "개선된 프롬프트",
              "score": 0.85,
              "changes": ["개선 사항 1", "개선 사항 2"]
            }

            score는 0~1 사이 값으로 개선 정도를 나타냅니다.
            changes는 실제 개선된 사항 2~5개를 나열합니다.
            """;

    public AiResult improve(List<Map<String, String>> history, String userPrompt, String goal, String modelName) {
        String resolvedModel = resolveModel(modelName);
        String systemPrompt = buildSystemPrompt(goal);
        List<Map<String, String>> messages = buildMessages(history, userPrompt);

        try {
            String rawResponse = isAnthropicModel(resolvedModel)
                    ? callAnthropic(messages, resolvedModel, systemPrompt)
                    : callOpenAi(messages, resolvedModel, systemPrompt);

            return parseResponse(rawResponse);
        } catch (CustomException e) {
            throw e;
        } catch (Exception e) {
            log.error("AI API call failed: {}", e.getMessage());
            throw new CustomException(ErrorCode.AI_API_ERROR);
        }
    }

    public Flux<String> improveStream(List<Map<String, String>> history, String userPrompt, String goal, String modelName) {
        String resolvedModel = resolveModel(modelName);
        String systemPrompt = buildSystemPrompt(goal);
        List<Map<String, String>> messages = buildMessages(history, userPrompt);

        if (isAnthropicModel(resolvedModel)) {
            return streamAnthropic(messages, resolvedModel, systemPrompt);
        } else {
            return streamOpenAi(messages, resolvedModel, systemPrompt);
        }
    }

    private String callOpenAi(List<Map<String, String>> messages, String model, String systemPrompt) {
        List<Map<String, String>> fullMessages = new ArrayList<>();
        fullMessages.add(Map.of("role", "system", "content", systemPrompt));
        fullMessages.addAll(messages);

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", fullMessages);
        body.put("temperature", 0.7);

        return webClient.post()
                .uri(openaiBaseUrl + "/chat/completions")
                .header("Authorization", "Bearer " + openaiApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(node -> node.path("choices").get(0).path("message").path("content").asText())
                .block();
    }

    private Flux<String> streamOpenAi(List<Map<String, String>> messages, String model, String systemPrompt) {
        List<Map<String, String>> fullMessages = new ArrayList<>();
        fullMessages.add(Map.of("role", "system", "content", systemPrompt));
        fullMessages.addAll(messages);

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", fullMessages);
        body.put("stream", true);
        body.put("temperature", 0.7);

        return webClient.post()
                .uri(openaiBaseUrl + "/chat/completions")
                .header("Authorization", "Bearer " + openaiApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(String.class)
                .filter(line -> line.startsWith("data: ") && !line.equals("data: [DONE]"))
                .flatMap(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line.substring(6));
                        String content = node.path("choices").get(0)
                                .path("delta").path("content").asText("");
                        return content.isEmpty() ? Flux.empty() : Flux.just(content);
                    } catch (Exception e) {
                        return Flux.empty();
                    }
                });
    }

    private String callAnthropic(List<Map<String, String>> messages, String model, String systemPrompt) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("system", systemPrompt);
        body.put("messages", messages);
        body.put("max_tokens", 2048);

        return webClient.post()
                .uri(anthropicBaseUrl + "/v1/messages")
                .header("x-api-key", anthropicApiKey)
                .header("anthropic-version", anthropicVersion)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(node -> node.path("content").get(0).path("text").asText())
                .block();
    }

    private Flux<String> streamAnthropic(List<Map<String, String>> messages, String model, String systemPrompt) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("system", systemPrompt);
        body.put("messages", messages);
        body.put("max_tokens", 2048);
        body.put("stream", true);

        return webClient.post()
                .uri(anthropicBaseUrl + "/v1/messages")
                .header("x-api-key", anthropicApiKey)
                .header("anthropic-version", anthropicVersion)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(String.class)
                .filter(line -> line.startsWith("data: "))
                .flatMap(line -> {
                    try {
                        JsonNode node = objectMapper.readTree(line.substring(6));
                        if ("content_block_delta".equals(node.path("type").asText())) {
                            String text = node.path("delta").path("text").asText("");
                            return text.isEmpty() ? Flux.empty() : Flux.just(text);
                        }
                        return Flux.empty();
                    } catch (Exception e) {
                        return Flux.<String>empty();
                    }
                });
    }

    private AiResult parseResponse(String rawResponse) {
        try {
            // JSON 블록 추출 (AI가 마크다운으로 감쌀 수 있음)
            String json = rawResponse.trim();
            if (json.startsWith("```")) {
                json = json.replaceAll("```json\\s*", "").replaceAll("```\\s*", "").trim();
            }

            JsonNode node = objectMapper.readTree(json);
            String improved = node.path("improved").asText(rawResponse);
            float score = (float) node.path("score").asDouble(0.7);

            List<String> changes = new ArrayList<>();
            JsonNode changesNode = node.path("changes");
            if (changesNode.isArray()) {
                changesNode.forEach(c -> changes.add(c.asText()));
            }

            return new AiResult(improved, score, changes);
        } catch (Exception e) {
            log.warn("Failed to parse AI response as JSON, using raw response");
            return new AiResult(rawResponse, null, List.of());
        }
    }

    private List<Map<String, String>> buildMessages(List<Map<String, String>> history, String userPrompt) {
        List<Map<String, String>> messages = new ArrayList<>(history);
        messages.add(Map.of("role", "user", "content", userPrompt));
        return messages;
    }

    private String buildSystemPrompt(String goal) {
        if (goal == null || goal.isBlank()) return SYSTEM_PROMPT;
        return SYSTEM_PROMPT + "\n\n목적 컨텍스트: " + goal;
    }

    private String resolveModel(String modelName) {
        if (modelName == null || modelName.isBlank()) {
            return openaiDefaultModel;
        }
        return modelName;
    }

    private boolean isAnthropicModel(String model) {
        return model.startsWith("claude");
    }

    public record AiResult(String improved, Float score, List<String> changes) {}
}
