package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PromptLikeRepository extends JpaRepository<PromptLike, Long> {
    Optional<PromptLike> findByPromptIdAndMemberId(Long promptId, Long memberId);
    boolean existsByPromptIdAndMemberId(Long promptId, Long memberId);
    List<PromptLike> findByMemberId(Long memberId);
}
