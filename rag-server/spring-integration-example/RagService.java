package com.yourapp.rag.service;

import com.yourapp.rag.dto.RagDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@Service
public class RagService {

    private final WebClient webClient;

    public RagService(
            @Value("${rag.server.url:http://localhost:8000}") String ragServerUrl
    ) {
        this.webClient = WebClient.builder()
                .baseUrl(ragServerUrl)
                .build();
    }

    // ──────────────────────────────────────────
    // 인덱싱: 청크 리스트 → FastAPI /index
    // ──────────────────────────────────────────

    /**
     * 파싱·청킹된 텍스트를 FastAPI RAG 서버로 전송해 임베딩 + 저장
     *
     * @param chunks   청킹된 텍스트 목록
     * @param metadata 각 청크의 메타데이터 (source, page 등) — null 허용
     * @return 저장된 청크 수
     */
    public Mono<RagDto.IndexResponse> index(
            List<String> chunks,
            List<Map<String, Object>> metadata
    ) {
        var request = new RagDto.IndexRequest(chunks, metadata);

        return webClient.post()
                .uri("/index")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(RagDto.IndexResponse.class);
    }

    // ──────────────────────────────────────────
    // 검색 + 생성: 쿼리 → FastAPI /query
    // ──────────────────────────────────────────

    /**
     * 사용자 질문을 FAstAPI로 보내 관련 청크 검색 + LLM 응답을 받아옴
     *
     * @param query 사용자 질문
     * @return LLM 답변 + 참조 출처 목록
     */
    public Mono<RagDto.QueryResponse> query(String query) {
        var request = new RagDto.QueryRequest(query);

        return webClient.post()
                .uri("/query")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(RagDto.QueryResponse.class);
    }

    /** top_k, 컬렉션 이름, 모델을 직접 지정하는 오버로드 */
    public Mono<RagDto.QueryResponse> query(
            String query,
            String collectionName,
            int topK,
            String model
    ) {
        var request = new RagDto.QueryRequest(query, collectionName, topK, model);

        return webClient.post()
                .uri("/query")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(RagDto.QueryResponse.class);
    }
}
