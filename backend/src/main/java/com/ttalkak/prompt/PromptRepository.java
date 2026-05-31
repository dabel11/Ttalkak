package com.ttalkak.prompt;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PromptRepository extends JpaRepository<Prompt, Long> {

    Page<Prompt> findByMemberId(Long memberId, Pageable pageable);

    Optional<Prompt> findByIdAndMemberId(Long id, Long memberId);
}
