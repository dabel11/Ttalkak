package com.ttalkak.usage;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Stores provider-reported usage, never prompt text or estimated token counts. */
@Service
public class RagUsageRecorder {
    private static final Logger log = LoggerFactory.getLogger(RagUsageRecorder.class);
    private final MemberTokenUsageService usage;
    private final ObjectMapper mapper;
    private final Clock clock;

    public RagUsageRecorder(MemberTokenUsageService usage, ObjectMapper mapper, Clock clock) {
        this.usage = usage;
        this.mapper = mapper;
        this.clock = clock;
    }

    public boolean record(Long memberId, String requestId, Map<?, ?> response) {
        if (memberId == null) return false;
        if (!(response.get("usage") instanceof Map<?, ?> reported) || reported.isEmpty()) {
            log.warn("RAG usage missing; member token usage was not recorded");
            return false;
        }
        TokenCounts counts;
        String details;
        try {
            boolean nested = reported.containsKey("summary");
            counts = nested ? nestedCounts(reported) : new TokenCounts(tokens(reported.get("input_tokens")),
                    tokens(reported.get("output_tokens")), tokens(reported.get("total_tokens")));
            // A provider may not supply usage. Zero does not mean a metered request.
            if (counts.totalTokens() == 0) return false;
            details = mapper.writeValueAsString(Map.of("calls", safeCalls(
                    reported.get(nested ? "records" : "calls"), nested)));
        } catch (IllegalArgumentException | ArithmeticException | JsonProcessingException e) {
            // Preserve compatibility with older RAG deployments; never fabricate billing data.
            log.warn("RAG usage invalid; member token usage was not recorded");
            return false;
        }
        // A missing client key is a new actual invocation, not a replayable request.
        String key = requestId == null ? UUID.randomUUID().toString() : requestId;
        usage.record(memberId, key, counts, clock.instant(), details);
        return true;
    }

    /** PR #46 separates visible output from billed output (visible + reasoning). */
    private static TokenCounts nestedCounts(Map<?, ?> reported) {
        if (!(reported.get("summary") instanceof Map<?, ?> summary)
                || !(reported.get("records") instanceof List<?> records) || records.isEmpty()) {
            throw new IllegalArgumentException("Usage summary or records missing");
        }
        if (tokens(summary.get("calls")) != records.size()) {
            throw new IllegalArgumentException("Usage call count mismatch");
        }
        long input = 0, output = 0, thoughts = 0, cached = 0;
        for (Object item : records) {
            if (!(item instanceof Map<?, ?> call)) throw new IllegalArgumentException("Invalid usage record");
            // Required counters must not be silently converted from null to zero.
            input = Math.addExact(input, tokens(call.get("prompt_tokens")));
            output = Math.addExact(output, tokens(call.get("completion_tokens")));
            thoughts = Math.addExact(thoughts, optionalTokens(call.get("thoughts_tokens")));
            cached = Math.addExact(cached, optionalTokens(call.get("cached_tokens")));
        }
        long billedOutput = Math.addExact(output, thoughts);
        if (tokens(summary.get("input_tokens")) != input
                || tokens(summary.get("output_tokens")) != output
                || tokens(summary.get("thoughts_tokens")) != thoughts
                || tokens(summary.get("billed_output_tokens")) != billedOutput
                || tokens(summary.get("cached_tokens")) != cached) {
            throw new IllegalArgumentException("Usage totals mismatch");
        }
        // Cached tokens are part of input, and reasoning is already in billedOutput.
        return new TokenCounts(input, output, Math.addExact(input, billedOutput));
    }

    private static long optionalTokens(Object value) {
        return value == null ? 0 : tokens(value);
    }

    private static long tokens(Object value) {
        if (!(value instanceof Number number)) throw new IllegalArgumentException("Token count missing");
        try {
            long count = new BigDecimal(number.toString()).longValueExact();
            if (count < 0) throw new IllegalArgumentException("Negative token count");
            return count;
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("Token count is not a nonnegative long", e);
        }
    }

    private static List<Map<String, Object>> safeCalls(Object value, boolean nested) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!(value instanceof List<?> calls)) return result;
        for (Object item : calls) {
            if (!(item instanceof Map<?, ?> call)) continue;
            if (result.size() == 64) break;
            Map<String, Object> safe = new LinkedHashMap<>();
            for (String field : List.of("stage", "model", "backend")) {
                if (call.get(field) instanceof String text && text.length() <= 160) safe.put(field, text);
            }
            for (String field : List.of("input_tokens", "output_tokens", "total_tokens",
                    "thoughts_tokens", "cached_tokens", "prompt", "completion", "thoughts",
                    "prompt_tokens", "completion_tokens")) {
                if (call.containsKey(field)) {
                    if (nested && call.get(field) == null
                            && (field.equals("thoughts_tokens") || field.equals("cached_tokens"))) continue;
                    safe.put(field, tokens(call.get(field)));
                }
            }
            result.add(safe);
        }
        return result;
    }
}
