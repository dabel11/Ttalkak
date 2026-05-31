package com.yourapp.rag.controller;

import com.yourapp.rag.dto.RagDto;
import com.yourapp.rag.service.RagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rag")
@RequiredArgsConstructor
public class RagController {

    private final RagService ragService;

    /**
     * POST /api/rag/index
     * 파싱·청킹 완료된 논문 청크를 인덱싱
     *
     * Body 예시:
     * {
     *   "chunks": ["텍스트1", "텍스트2"],
     *   "metadata": [{"source": "논문명", "page": 1}, {...}]
     * }
     */
    @PostMapping("/index")
    public Mono<ResponseEntity<RagDto.IndexResponse>> index(
            @RequestBody IndexBody body
    ) {
        return ragService.index(body.chunks(), body.metadata())
                .map(ResponseEntity::ok);
    }

    /**
     * POST /api/rag/query
     * 사용자 질문에 대해 RAG 검색 + LLM 응답 반환
     *
     * Body 예시:
     * { "query": "chain-of-thought 프롬프팅이란?" }
     */
    @PostMapping("/query")
    public Mono<ResponseEntity<RagDto.QueryResponse>> query(
            @RequestBody QueryBody body
    ) {
        return ragService.query(body.query())
                .map(ResponseEntity::ok);
    }

    // ── 요청 바디 레코드 ──────────────────────
    record IndexBody(List<String> chunks, List<Map<String, Object>> metadata) {}
    record QueryBody(String query) {}
}
