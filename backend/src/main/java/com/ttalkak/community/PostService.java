package com.ttalkak.community;

import com.ttalkak.community.dto.*;
import com.ttalkak.common.exception.CustomException;
import com.ttalkak.common.exception.ErrorCode;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberService;
import com.ttalkak.prompt.Prompt;
import com.ttalkak.prompt.PromptRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostService {

    private final CommunityPostRepository postRepository;
    private final PostLikeRepository likeRepository;
    private final TagRepository tagRepository;
    private final PostTagRepository postTagRepository;
    private final MemberService memberService;
    private final PromptRepository promptRepository;

    public Page<PostListResponse> getPosts(Long currentUserId, Pageable pageable) {
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        Page<CommunityPost> posts = postRepository.findActiveOrderByWeeklyLikes(weekAgo, pageable);
        return posts.map(post -> toListResponse(post, currentUserId));
    }

    @Transactional
    public PostDetailResponse getPost(Long postId, Long currentUserId) {
        CommunityPost post = findActivePost(postId);
        post.incrementViewCount();

        long likeCount = likeRepository.countByPostId(postId);
        boolean liked = currentUserId != null && likeRepository.existsByPostIdAndMemberId(postId, currentUserId);
        List<String> tags = getTagNames(postId);

        return PostDetailResponse.of(post, likeCount, liked, tags);
    }

    @Transactional
    public PostDetailResponse createPost(CreatePostRequest request, Long memberId) {
        Member member = memberService.findById(memberId);
        Prompt prompt = promptRepository.findByIdAndMemberId(request.getPromptId(), memberId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROMPT_NOT_FOUND));

        prompt.makePublic();

        CommunityPost post = CommunityPost.builder()
                .member(member)
                .prompt(prompt)
                .title(request.getTitle())
                .content(request.getContent())
                .build();

        post = postRepository.save(post);

        if (request.getTags() != null && !request.getTags().isEmpty()) {
            attachTags(post, request.getTags());
        }

        return PostDetailResponse.of(post, 0L, false, getTagNames(post.getId()));
    }

    @Transactional
    public LikeResponse toggleLike(Long postId, Long memberId) {
        findActivePost(postId);
        Member member = memberService.findById(memberId);
        CommunityPost post = postRepository.getReferenceById(postId);

        Optional<PostLike> existing = likeRepository.findByPostIdAndMemberId(postId, memberId);
        boolean liked;

        if (existing.isPresent()) {
            likeRepository.delete(existing.get());
            liked = false;
        } else {
            likeRepository.save(PostLike.builder().post(post).member(member).build());
            liked = true;
        }

        long likeCount = likeRepository.countByPostId(postId);
        return LikeResponse.builder().liked(liked).likeCount(likeCount).build();
    }

    public List<TagResponse> getPopularTags() {
        return tagRepository.findTop20ByOrderByUseCountDesc().stream()
                .map(TagResponse::from)
                .collect(Collectors.toList());
    }

    public Page<PostListResponse> searchByTags(List<String> tagNames, Long currentUserId, Pageable pageable) {
        List<String> normalized = tagNames.stream()
                .map(String::toLowerCase)
                .collect(Collectors.toList());
        return postRepository.searchByTags(normalized, pageable)
                .map(post -> toListResponse(post, currentUserId));
    }

    public Page<PostListResponse> getLikedPosts(Long memberId, Pageable pageable) {
        return postRepository.findLikedByMember(memberId, pageable)
                .map(post -> toListResponse(post, memberId));
    }

    private CommunityPost findActivePost(Long postId) {
        CommunityPost post = postRepository.findById(postId)
                .orElseThrow(() -> new CustomException(ErrorCode.POST_NOT_FOUND));
        if (post.getStatus() != PostStatus.ACTIVE) {
            throw new CustomException(ErrorCode.POST_NOT_FOUND);
        }
        return post;
    }

    private PostListResponse toListResponse(CommunityPost post, Long currentUserId) {
        long likeCount = likeRepository.countByPostId(post.getId());
        boolean liked = currentUserId != null &&
                likeRepository.existsByPostIdAndMemberId(post.getId(), currentUserId);
        List<String> tags = getTagNames(post.getId());
        return PostListResponse.of(post, likeCount, liked, tags);
    }

    private List<String> getTagNames(Long postId) {
        return postTagRepository.findByPostId(postId).stream()
                .map(pt -> pt.getTag().getName())
                .collect(Collectors.toList());
    }

    private void attachTags(CommunityPost post, List<String> tagNames) {
        for (String rawName : tagNames) {
            String name = rawName.toLowerCase().trim();
            if (name.isEmpty()) continue;

            Tag tag = tagRepository.findByName(name)
                    .orElseGet(() -> tagRepository.save(Tag.builder().name(name).build()));

            tag.incrementUseCount();

            postTagRepository.save(PostTag.builder().post(post).tag(tag).build());
        }
    }
}
