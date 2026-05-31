package com.yourapp.rag.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

// ──────────────────────────────────────────
// /index 요청
// ──────────────────────────────────────────
public class RagDto {

    public record IndexRequest(
            List<String> chunks,
            List<Map<String, Object>> metadata,
            @JsonProperty("collection_name") String collectionName
    ) {
        public IndexRequest(List<String> chunks, List<Map<String, Object>> metadata) {
            this(chunks, metadata, "papers");
        }
    }

    public record IndexResponse(
            @JsonProperty("indexed_count") int indexedCount,
            @JsonProperty("collection_name") String collectionName
    ) {}

    // ──────────────────────────────────────
    // /query 요청
    // ──────────────────────────────────────

    public record QueryRequest(
            String query,
            @JsonProperty("collection_name") String collectionName,
            @JsonProperty("top_k") int topK,
            String model
    ) {
        /** 기본값 적용 편의 생성자 */
        public QueryRequest(String query) {
            this(query, "papers", 5, "claude-3-haiku-20240307");
        }
    }

    public record QueryResponse(
            String answer,
            List<SourceDoc> sources
    ) {}

    public record SourceDoc(
            String text,
            Map<String, Object> metadata,
            double score
    ) {}
}
