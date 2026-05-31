package com.ttalkak.community;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    List<Comment> findByPostIdAndParentCommentIsNullOrderByCreatedAtAsc(Long postId);

    List<Comment> findByParentCommentIdOrderByCreatedAtAsc(Long parentCommentId);
}
