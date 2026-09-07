package com.ttalkak.community;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CommentLikeRepository extends JpaRepository<CommentLike, Long> {
    boolean existsByCommentIdAndMemberId(Long commentId, Long memberId);
    Optional<CommentLike> findByCommentIdAndMemberId(Long commentId, Long memberId);
}
