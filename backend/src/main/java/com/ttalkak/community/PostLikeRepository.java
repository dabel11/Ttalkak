package com.ttalkak.community;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PostLikeRepository extends JpaRepository<PostLike, Long> {

    Optional<PostLike> findByPostIdAndMemberId(Long postId, Long memberId);

    long countByPostId(Long postId);

    boolean existsByPostIdAndMemberId(Long postId, Long memberId);
}
