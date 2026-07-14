package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PromptRepository extends JpaRepository<PromptPost, Long> {

    List<PromptPost> findByDeletedFalseAndSharedTrue();

    List<PromptPost> findByDeletedFalseAndAuthorId(Long authorId);

    List<PromptPost> findByAuthorIdOrderByUpdatedAtDesc(Long authorId);
}
