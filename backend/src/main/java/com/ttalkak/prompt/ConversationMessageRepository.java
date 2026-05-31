package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationMessageRepository extends JpaRepository<ConversationMessage, Long> {

    List<ConversationMessage> findByConversationIdOrderByCreatedAtAsc(Long conversationId);

    // 최근 N개만 가져와 토큰 비용 제어
    List<ConversationMessage> findTop10ByConversationIdOrderByCreatedAtAsc(Long conversationId);
}
