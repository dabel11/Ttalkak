package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface PromptAuthorRevisionRequestRepository
        extends JpaRepository<PromptAuthorRevisionRequest, Long> {

    List<PromptAuthorRevisionRequest>
    findByAuthorIdOrderByCreatedAtDesc(Long authorId);

    List<PromptAuthorRevisionRequest>
    findAllByOrderByCreatedAtDesc();

    List<PromptAuthorRevisionRequest>
    findByStatusIgnoreCaseOrderByCreatedAtDesc(String status);

    boolean existsByPromptIdAndStatusIn(
            Long promptId,
            Collection<String> statuses
    );
}
