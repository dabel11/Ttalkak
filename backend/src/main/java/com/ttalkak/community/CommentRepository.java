package com.ttalkak.community;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, Long> {
    List<Comment> findByPromptIdAndParentIdIsNullOrderByLikesDescCreatedAtAsc(Long promptId);
    List<Comment> findByParentIdOrderByLikesDescCreatedAtAsc(Long parentId);
    List<Comment> findByAuthorIdOrderByCreatedAtDesc(Long authorId);
    long countByParentId(Long parentId);
}
