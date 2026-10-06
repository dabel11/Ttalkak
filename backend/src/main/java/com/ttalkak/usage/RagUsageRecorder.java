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
            counts = new TokenCounts(tokens(reported.get("input_tokens")),
                    tokens(reported.get("output_tokens")), tokens(reported.get("total_tokens")));
            // A provider may not supply usage. Zero does not mean a metered request.
            if (counts.totalTokens() == 0) return false;
            details = mapper.writeValueAsString(Map.of("calls", safeCalls(reported.get("calls"))));
        } catch (IllegalArgumentException | JsonProcessingException e) {
            // Preserve compatibility with older RAG deployments; never fabricate billing data.
            log.warn("RAG usage invalid; member token usage was not recorded");
            return false;
        }
        // A missing client key is a new actual invocation, not a replayable request.
        String key = requestId == null ? UUID.randomUUID().toString() : requestId;
        usage.record(memberId, key, counts, clock.instant(), details);
        return true;
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

    private static List<Map<String, Object>> safeCalls(Object value) {
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
                    "thoughts_tokens", "cached_tokens", "prompt", "completion", "thoughts")) {
                if (call.containsKey(field)) safe.put(field, tokens(call.get(field)));
            }
            result.add(safe);
        }
        return result;
    }
}
