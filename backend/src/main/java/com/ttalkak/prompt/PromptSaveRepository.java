package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PromptSaveRepository extends JpaRepository<PromptSave, Long> {
    Optional<PromptSave> findByPromptIdAndMemberId(Long promptId, Long memberId);
    boolean existsByPromptIdAndMemberId(Long promptId, Long memberId);
    List<PromptSave> findByMemberId(Long memberId);
}
