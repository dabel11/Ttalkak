package com.ttalkak.community;

import com.ttalkak.common.response.ApiResponse;
import com.ttalkak.common.security.UserPrincipal;
import com.ttalkak.community.dto.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/community")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    @GetMapping("/posts")
    public ApiResponse<Page<PostListResponse>> getPosts(
            @AuthenticationPrincipal(required = false) UserPrincipal user,
            @PageableDefault(size = 16) Pageable pageable) {
        Long userId = user != null ? user.getId() : null;
        return ApiResponse.ok(postService.getPosts(userId, pageable));
    }

    @GetMapping("/posts/{postId}")
    public ApiResponse<PostDetailResponse> getPost(
            @PathVariable Long postId,
            @AuthenticationPrincipal(required = false) UserPrincipal user) {
        Long userId = user != null ? user.getId() : null;
        return ApiResponse.ok(postService.getPost(postId, userId));
    }

    @PostMapping("/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PostDetailResponse> createPost(
            @Valid @RequestBody CreatePostRequest request,
            @AuthenticationPrincipal UserPrincipal user) {
        return ApiResponse.ok(postService.createPost(request, user.getId()));
    }

    @PostMapping("/posts/{postId}/likes")
    public ApiResponse<LikeResponse> toggleLike(
            @PathVariable Long postId,
            @AuthenticationPrincipal UserPrincipal user) {
        return ApiResponse.ok(postService.toggleLike(postId, user.getId()));
    }

    @GetMapping("/tags/popular")
    public ApiResponse<List<TagResponse>> getPopularTags() {
        return ApiResponse.ok(postService.getPopularTags());
    }

    @GetMapping("/search")
    public ApiResponse<Page<PostListResponse>> search(
            @RequestParam List<String> tags,
            @AuthenticationPrincipal(required = false) UserPrincipal user,
            @PageableDefault(size = 16) Pageable pageable) {
        Long userId = user != null ? user.getId() : null;
        return ApiResponse.ok(postService.searchByTags(tags, userId, pageable));
    }

    @GetMapping("/posts/liked")
    public ApiResponse<Page<PostListResponse>> getLikedPosts(
            @AuthenticationPrincipal UserPrincipal user,
            @PageableDefault(size = 16) Pageable pageable) {
        return ApiResponse.ok(postService.getLikedPosts(user.getId(), pageable));
    }
}
