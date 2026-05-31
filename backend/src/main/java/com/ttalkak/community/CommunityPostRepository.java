package com.ttalkak.community;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {

    // 이번주 인기순: 7일 이내 좋아요 수 기준 정렬
    @Query("SELECT p FROM CommunityPost p WHERE p.status = 'ACTIVE' " +
           "ORDER BY (SELECT COUNT(l) FROM PostLike l WHERE l.post = p AND l.createdAt >= :weekAgo) DESC, " +
           "p.createdAt DESC")
    Page<CommunityPost> findActiveOrderByWeeklyLikes(@Param("weekAgo") LocalDateTime weekAgo, Pageable pageable);

    // 태그 기반 검색 (OR 방식 - 지정 태그 중 하나 이상 포함)
    @Query("SELECT DISTINCT p FROM CommunityPost p " +
           "JOIN PostTag pt ON pt.post = p " +
           "JOIN Tag t ON pt.tag = t " +
           "WHERE t.name IN :tagNames AND p.status = 'ACTIVE' " +
           "ORDER BY p.createdAt DESC")
    Page<CommunityPost> searchByTags(@Param("tagNames") List<String> tagNames, Pageable pageable);

    // 좋아요한 게시글 목록
    @Query("SELECT p FROM CommunityPost p " +
           "WHERE p.id IN (SELECT l.post.id FROM PostLike l WHERE l.member.id = :memberId) " +
           "AND p.status = 'ACTIVE' " +
           "ORDER BY p.createdAt DESC")
    Page<CommunityPost> findLikedByMember(@Param("memberId") Long memberId, Pageable pageable);
}
