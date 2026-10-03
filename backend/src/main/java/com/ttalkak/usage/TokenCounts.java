package com.ttalkak.usage;

/** Actual provider usage aggregated across all LLM calls for one /query request. */
public record TokenCounts(long inputTokens, long outputTokens, long totalTokens) {
    public TokenCounts {
        if (inputTokens < 0 || outputTokens < 0 || totalTokens < 0
                || totalTokens < inputTokens || totalTokens - inputTokens < outputTokens) {
            throw new IllegalArgumentException("Token counts must be nonnegative and consistent");
        }
    }
}
