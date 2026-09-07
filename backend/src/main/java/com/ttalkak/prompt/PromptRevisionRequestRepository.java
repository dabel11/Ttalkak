package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PromptRevisionRequestRepository
        extends JpaRepository<PromptRevisionRequest, Long> {

    List<PromptRevisionRequest>
    findByRequesterIdOrderByCreatedAtDesc(Long requesterId);

    List<PromptRevisionRequest>
    findAllByOrderByCreatedAtDesc();

    List<PromptRevisionRequest>
    findByStatusIgnoreCaseOrderByCreatedAtDesc(String status);

    boolean existsByPromptIdAndRequesterIdAndStatusIgnoreCase(
            Long promptId,
            Long requesterId,
            String status
    );
}
