package com.ttalkak.prompt;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PromptRepository extends JpaRepository<PromptPost, Long> {

    List<PromptPost> findByDeletedFalseAndSharedTrue();

    List<PromptPost> findByDeletedFalseAndAuthorId(Long authorId);

    List<PromptPost> findByAuthorIdOrderByUpdatedAtDesc(Long authorId);

    @Query("""
        select prompt
        from PromptPost prompt
        where prompt.tagsCsv is not null
          and locate(
                concat(',', concat(lower(:tagName), ',')),
                concat(
                    ',',
                    concat(
                        lower(replace(prompt.tagsCsv, ' ', '')),
                        ','
                    )
                )
              ) > 0
        order by prompt.updatedAt desc, prompt.id desc
        """)
    Page<PromptPost> findAllByExactTag(
        @Param("tagName") String tagName,
        Pageable pageable
    );
}