package com.ttalkak.usage;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
})
class RagUsageRecorderIntegrationTest {
    @Autowired RagUsageRecorder recorder;
    @Autowired MemberTokenUsageRepository repository;
    @Autowired UsagePeriodService periods;
    @Autowired ObjectMapper mapper;

    private long member() { return Math.abs(UUID.randomUUID().getLeastSignificantBits() % 1_000_000) + 1; }

    private Map<String, Object> response() {
        return Map.of("answer", "private answer", "usage", Map.of(
                "input_tokens", 100, "output_tokens", 20, "total_tokens", 125,
                "calls", List.of(
                        Map.of("stage", "analyze", "model", "analysis-model",
                                "input_tokens", 30, "output_tokens", 5, "total_tokens", 35),
                        Map.of("stage", "generate", "model", "generation-model",
                                "input_tokens", 70, "output_tokens", 15, "total_tokens", 90,
                                "thoughts_tokens", 5, "cached_tokens", 10,
                                "query", "private prompt", "api_key", "secret"))));
    }

    @Test
    void storesReportedTotalsOnceAndSanitizesStageDetails() throws Exception {
        long member = member();
        String key = UUID.randomUUID().toString();
        recorder.record(member, key, response());
        recorder.record(member, key, response());
        var row = repository.findByMemberIdAndRequestKey(member, key).orElseThrow();
        assertEquals(100, row.getInputTokens());
        assertEquals(20, row.getOutputTokens());
        assertEquals(125, row.getTotalTokens()); // Includes reasoning; do not add its five tokens twice.
        var details = mapper.readTree(row.getUsageDetailsJson());
        assertEquals(2, details.get("calls").size());
        assertEquals(5, details.get("calls").get(1).get("thoughts_tokens").asLong());
        assertEquals(10, details.get("calls").get(1).get("cached_tokens").asLong());
        assertFalse(row.getUsageDetailsJson().contains("private"));
        assertFalse(row.getUsageDetailsJson().contains("secret"));
        var snapshot = periods.at(member, Instant.now().plusSeconds(1));
        assertEquals(125, snapshot.totalTokens());
        assertEquals(1, snapshot.requests());
    }

    @Test
    void differentTurnsAndMembersHaveIndependentUsageKeys() {
        long first = member(), second = member();
        String key = UUID.randomUUID().toString();
        recorder.record(first, key, response());
        recorder.record(first, key + "-turn-2", response());
        recorder.record(second, key, response());
        assertEquals(250, periods.at(first, Instant.now().plusSeconds(1)).totalTokens());
        assertEquals(125, periods.at(second, Instant.now().plusSeconds(1)).totalTokens());
    }

    @Test
    void missingZeroOrMalformedUsageDoesNotInventConsumption() {
        long member = member();
        recorder.record(member, "missing", Map.of("answer", "legacy response"));
        recorder.record(member, "zero", Map.of("usage", Map.of(
                "input_tokens", 0, "output_tokens", 0, "total_tokens", 0)));
        for (Object invalid : List.of(-1, 1.5, "100")) {
            recorder.record(member, "invalid", Map.of("usage", Map.of(
                    "input_tokens", invalid, "output_tokens", 20, "total_tokens", 125)));
        }
        assertEquals(0, periods.at(member, Instant.now().plusSeconds(1)).requests());
    }

    @Test
    void absentRequestIdCountsEachActualInvocationAndGuestsAreNotMemberUsage() {
        long member = member();
        recorder.record(member, null, response());
        recorder.record(member, null, response());
        long beforeGuest = repository.count();
        recorder.record(null, "guest", response());
        assertEquals(beforeGuest, repository.count());
        assertEquals(2, periods.at(member, Instant.now().plusSeconds(1)).requests());
    }
}
