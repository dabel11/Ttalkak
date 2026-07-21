package com.ttalkak.admin;

import com.ttalkak.community.Comment;
import com.ttalkak.community.CommentRepository;
import com.ttalkak.community.Report;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.community.ReportResponseMapper;
import com.ttalkak.community.ReportStatus;
import com.ttalkak.make.MakeFolder;
import com.ttalkak.make.MakeFolderRepository;
import com.ttalkak.make.MakeThread;
import com.ttalkak.make.MakeThreadRepository;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptMapper;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.Tag;
import com.ttalkak.prompt.TagRepository;
import com.ttalkak.prompt.TagStatus;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.common.response.MemberSummaryResponse;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final ReportRepository reportRepository;
    private final ReportResponseMapper reportResponseMapper;
    private final PromptRepository promptRepository;
    private final TagRepository tagRepository;
    private final MemberRepository memberRepository;
    private final CommentRepository commentRepository;
    private final MakeThreadRepository makeThreadRepository;
    private final MakeFolderRepository makeFolderRepository;
    private final AdminAuditLogRepository adminAuditLogRepository;

    public AdminController(
            ReportRepository reportRepository,
            ReportResponseMapper reportResponseMapper,
            PromptRepository promptRepository,
            TagRepository tagRepository,
            MemberRepository memberRepository,
            CommentRepository commentRepository,
            MakeThreadRepository makeThreadRepository,
            MakeFolderRepository makeFolderRepository,
            AdminAuditLogRepository adminAuditLogRepository
    ) {
        this.reportRepository = reportRepository;
        this.reportResponseMapper = reportResponseMapper;
        this.promptRepository = promptRepository;
        this.tagRepository = tagRepository;
        this.memberRepository = memberRepository;
        this.commentRepository = commentRepository;
        this.makeThreadRepository = makeThreadRepository;
        this.makeFolderRepository = makeFolderRepository;
        this.adminAuditLogRepository = adminAuditLogRepository;
    }

    @Transactional
	@GetMapping("/users")
	public Map<String, Object> searchUsers(
			@RequestParam(required = false) String nickname,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		String normalizedNickname =
				nickname == null ? "" : nickname.trim();

		if (normalizedNickname.isBlank()) {
			throw new ApiException(
					HttpStatus.BAD_REQUEST,
					"NICKNAME_REQUIRED",
					"검색할 닉네임을 입력해야 합니다."
			);
		}

		List<Map<String, Object>> items = memberRepository
				.findByNicknameContainingIgnoreCaseOrderByNicknameAsc(
						normalizedNickname
				)
				.stream()
				.map(this::memberSearchMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

    @PatchMapping("/users/{memberId}/block")
    public Map<String, Object> blockUser(
            @PathVariable Long memberId,
            @RequestBody BlockUserRequest request,
            @AuthenticationPrincipal Member admin
    ) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "회원을 찾을 수 없습니다."
                ));

        if (!member.isActive()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ACCOUNT_WITHDRAWN",
                    "탈퇴한 회원은 차단할 수 없습니다."
            );
        }

        if ("ADMIN".equalsIgnoreCase(member.getRole())) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_ACCOUNT_PROTECTED",
                    "관리자 계정은 차단할 수 없습니다."
            );
        }

        String reason = request == null
                ? null
                : request.reason();

        if (reason == null || reason.isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "BLOCK_REASON_REQUIRED",
                    "차단 사유를 입력해야 합니다."
            );
        }

        member.block(reason.trim());
        memberRepository.save(member);

		recordAudit(
			admin,
			"USER_BLOCK",
			"USER",
			memberId,
			"대상 사용자: "
				+ displayValue(member.getNickname(), "알 수 없음")
				+ " (memberId: "
				+ memberId
				+ "), 차단 사유: "
				+ reason.trim()
		);

        return memberActivityMap(member);
    }

    @Transactional
    @PatchMapping("/users/{memberId}/unblock")
    public Map<String, Object> unblockUser(
            @PathVariable Long memberId,
            @AuthenticationPrincipal Member admin
    ) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "회원을 찾을 수 없습니다."
                ));

        if (!member.isActive()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ACCOUNT_WITHDRAWN",
                    "탈퇴한 회원은 차단 해제할 수 없습니다."
            );
        }

        if (!member.isBlocked()) {
            return memberActivityMap(member);
        }

        String previousBlockReason = member.getBlockReason();
        member.unblock();
        memberRepository.save(member);

		recordAudit(
			admin,
			"USER_UNBLOCK",
			"USER",
			memberId,
			"대상 사용자: "
				+ displayValue(member.getNickname(), "알 수 없음")
				+ " (memberId: "
				+ memberId
				+ "), 차단 해제"
				+ (previousBlockReason == null
					? ""
					: ", 기존 차단 사유: " + previousBlockReason)
		);

        return memberActivityMap(member);
    }

	@GetMapping("/users/{memberId}/prompts")
	public Map<String, Object> userPrompts(
			@PathVariable Long memberId,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		memberRepository.findById(memberId)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND,
						"회원을 찾을 수 없습니다."
				));

		List<Map<String, Object>> items = promptRepository
				.findByAuthorIdOrderByUpdatedAtDesc(memberId)
				.stream()
				.map(this::adminPromptMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

	@GetMapping("/users/{memberId}/comments")
	public Map<String, Object> userComments(
			@PathVariable Long memberId,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		requireMember(memberId);

		List<Map<String, Object>> items = commentRepository
				.findByAuthorIdAndParentIdIsNullOrderByCreatedAtDesc(
						memberId
				)
				.stream()
				.map(this::adminUserCommentMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

	@GetMapping("/users/{memberId}/replies")
	public Map<String, Object> userReplies(
			@PathVariable Long memberId,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		requireMember(memberId);

		List<Map<String, Object>> items = commentRepository
				.findByAuthorIdAndParentIdIsNotNullOrderByCreatedAtDesc(
						memberId
				)
				.stream()
				.map(this::adminUserCommentMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

	@GetMapping("/users/{memberId}/reports/submitted")
	public Map<String, Object> userSubmittedReports(
			@PathVariable Long memberId,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		requireMember(memberId);

		List<Map<String, Object>> items = reportRepository
				.findByReporterIdOrderByCreatedAtDesc(memberId)
				.stream()
				.map(this::reportMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

	@GetMapping("/users/{memberId}/reports/received")
	public Map<String, Object> userReceivedReports(
			@PathVariable Long memberId,
			@RequestParam(defaultValue = "1") int page,
			@RequestParam(required = false) Integer size,
			@RequestParam(required = false) Integer pageSize
	) {
		requireMember(memberId);

		List<Long> promptIds = promptRepository
				.findByAuthorIdOrderByUpdatedAtDesc(memberId)
				.stream()
				.map(PromptPost::getId)
				.toList();

		List<Long> commentIds = commentRepository
				.findByAuthorIdOrderByCreatedAtDesc(memberId)
				.stream()
				.map(Comment::getId)
				.toList();

		List<Report> receivedReports = new ArrayList<>();

		if (!promptIds.isEmpty()) {
			receivedReports.addAll(
					reportRepository
							.findByTargetTypeAndTargetIdInOrderByCreatedAtDesc(
									"prompt",
									promptIds
							)
			);
		}

		if (!commentIds.isEmpty()) {
			receivedReports.addAll(
					reportRepository
							.findByTargetTypeAndTargetIdInOrderByCreatedAtDesc(
									"comment",
									commentIds
							)
			);
		}

		List<Map<String, Object>> items = receivedReports.stream()
				.sorted(
						Comparator.comparing(Report::getCreatedAt)
								.reversed()
								.thenComparing(
										Report::getId,
										Comparator.reverseOrder()
								)
				)
				.map(this::reportMap)
				.toList();

		return pageResponse(items, page, size, pageSize);
	}

	@GetMapping("/users/{memberId}/activity")
	public Map<String, Object> userActivitySummary(
			@PathVariable Long memberId
	) {
		Member member = memberRepository.findById(memberId)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND,
						"회원을 찾을 수 없습니다."
				));

		List<PromptPost> prompts =
				promptRepository.findByAuthorIdOrderByUpdatedAtDesc(
						memberId
				);

		List<Comment> authoredComments =
				commentRepository.findByAuthorIdOrderByCreatedAtDesc(
						memberId
				);

		List<Report> submittedReports =
				reportRepository.findByReporterIdOrderByCreatedAtDesc(
						memberId
				);

		long commentCount = authoredComments.stream()
				.filter(comment -> comment.getParentId() == null)
				.count();

		long replyCount = authoredComments.stream()
				.filter(comment -> comment.getParentId() != null)
				.count();

		List<Long> promptIds = prompts.stream()
				.map(PromptPost::getId)
				.toList();

		List<Long> commentIds = authoredComments.stream()
				.map(Comment::getId)
				.toList();

		long receivedPromptReports = promptIds.isEmpty()
				? 0
				: reportRepository.countByTargetTypeAndTargetIdIn(
						"prompt",
						promptIds
				);

		long receivedCommentReports = commentIds.isEmpty()
				? 0
				: reportRepository.countByTargetTypeAndTargetIdIn(
						"comment",
						commentIds
				);

		Map<String, Object> counts = new LinkedHashMap<>();
		counts.put("prompts", prompts.size());
		counts.put("comments", commentCount);
		counts.put("replies", replyCount);
		counts.put("submittedReports", submittedReports.size());
		counts.put(
				"receivedReports",
				receivedPromptReports + receivedCommentReports
		);

		Map<String, Object> body = new LinkedHashMap<>();
		body.put("user", memberSearchMap(member));
		body.put("counts", counts);

		return body;
	}

    @GetMapping("/users/{memberId}/activities")
    public Map<String, Object> userActivities(
            @PathVariable Long memberId,
            @RequestParam(defaultValue = "20") int limit
    ) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "회원을 찾을 수 없습니다."
                ));

        List<PromptPost> prompts =
                promptRepository.findByAuthorIdOrderByUpdatedAtDesc(memberId);

        List<Comment> comments =
                commentRepository.findByAuthorIdOrderByCreatedAtDesc(memberId);

        List<Report> reports =
                reportRepository.findByReporterIdOrderByCreatedAtDesc(memberId);

        List<MakeThread> makeThreads =
                makeThreadRepository.findByMemberIdOrderByUpdatedAtDesc(memberId);

        List<MakeFolder> makeFolders =
                makeFolderRepository.findByMemberIdOrderByCreatedAtDesc(memberId);

        List<ActivityItem> allActivities = new ArrayList<>();

        prompts.forEach(prompt ->
                allActivities.add(promptActivity(prompt))
        );

        comments.forEach(comment ->
                allActivities.add(commentActivity(comment))
        );

        reports.forEach(report ->
                allActivities.add(reportActivity(report))
        );

        makeThreads.forEach(thread ->
                allActivities.add(makeThreadActivity(thread))
        );

        makeFolders.forEach(folder ->
                allActivities.add(makeFolderActivity(folder))
        );

        List<Map<String, Object>> activities = allActivities.stream()
                .sorted(
                        Comparator.comparing(ActivityItem::occurredAt)
                                .reversed()
                )
                .limit(safeLimit)
                .map(ActivityItem::body)
                .toList();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("prompts", prompts.size());
        summary.put("comments", comments.size());
        summary.put("reports", reports.size());
        summary.put("makeThreads", makeThreads.size());
        summary.put("makeFolders", makeFolders.size());
        summary.put(
                "total",
                prompts.size()
                        + comments.size()
                        + reports.size()
                        + makeThreads.size()
                        + makeFolders.size()
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("member", memberActivityMap(member));
        body.put("summary", summary);
        body.put("activities", activities);
        body.put("limit", safeLimit);
        body.put("returned", activities.size());
        body.put(
                "latestActivityAt",
                activities.isEmpty()
                        ? null
                        : activities.get(0).get("occurredAt")
        );

        return body;
    }

    @GetMapping("/audit-logs")
    public Map<String, Object> auditLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        List<Map<String, Object>> items =
                adminAuditLogRepository
                        .findAllByOrderByCreatedAtDescIdDesc()
                        .stream()
                        .map(this::auditLogMap)
                        .toList();

        return pageResponse(
                items,
                page,
                size,
                pageSize
        );
    }

    @GetMapping("/reports")
    public Map<String, Object> reports(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        String normalizedStatus =
                normalizeReportFilterStatus(status);

        List<Map<String, Object>> items =
                reportRepository.findAll().stream()
                        .filter(report ->
                                "all".equals(normalizedStatus)
                                        || normalizedStatus.equals(
                                                report.getStatus()
                                        )
                        )
                        .sorted(
                                Comparator.comparing(
                                                Report::getCreatedAt
                                        )
                                        .reversed()
                                        .thenComparing(
                                                Report::getId,
                                                Comparator.reverseOrder()
                                        )
                        )
                        .map(this::reportMap)
                        .toList();

        return pageResponse(items, page, size, pageSize);
    }

    @Transactional
    @PatchMapping("/reports/{id}/status")
    public ResponseEntity<?> updateReportStatus(
            @PathVariable Long id,
            @RequestBody StatusRequest request,
            @AuthenticationPrincipal Member admin
    ) {
        Report report = reportRepository.findById(id).orElse(null);

        if (report == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        }

        ReportStatus nextStatus = normalizeReportStatus(
                request.status(),
                ReportStatus.REVIEWED
        );

        if (!report.canTransitionTo(nextStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "신고 상태를 "
                            + report.getStatus()
                            + "에서 "
                            + nextStatus.value()
                            + "(으)로 변경할 수 없습니다."
            );
        }

        String previousStatus = report.getStatus();
        report.changeStatus(nextStatus, request.memo());

        reportRepository.save(report);

		String auditDetail =
			"신고 대상: "
				+ report.getTargetType()
				+ "#"
				+ report.getTargetId()
				+ ", 신고 사유: "
				+ displayValue(preview(report.getReason()), "없음")
				+ ", 상태: "
				+ previousStatus
				+ " -> "
				+ report.getStatus()
				+ (report.getMemo() == null
					? ""
					: ", 관리자 메모: " + preview(report.getMemo()));

        recordAudit(
                admin,
                "REPORT_STATUS_CHANGE",
                "REPORT",
                id,
                auditDetail
        );

        return ResponseEntity.ok(reportMap(report));
    }

    @GetMapping("/prompts")
    public Map<String, Object> prompts(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        int resolvedSize = size != null
                ? size
                : (pageSize != null ? pageSize : 16);

        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(resolvedSize, 1), 100);

        String normalizedQuery = query == null
                ? ""
                : query.trim().toLowerCase(Locale.ROOT);

        String normalizedStatus = normalizePromptStatus(status);

        List<PromptPost> filtered = promptRepository.findAll().stream()
                .filter(prompt -> matchesPromptStatus(prompt, normalizedStatus))
                .filter(prompt -> matchesPromptQuery(prompt, normalizedQuery))
                .sorted(
                        Comparator.comparing(PromptPost::getUpdatedAt)
                                .reversed()
                                .thenComparing(
                                        PromptPost::getId,
                                        Comparator.reverseOrder()
                                )
                )
                .toList();

        int total = filtered.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<Map<String, Object>> items = filtered.subList(from, to).stream()
                .map(this::adminPromptMap)
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0 ? 0 : (int) Math.ceil((double) total / safeSize)
        );

        return body;
    }

    @Transactional
    @PatchMapping("/prompts/{id}/hide")
    public ResponseEntity<?> hidePrompt(
            @PathVariable Long id,
            @AuthenticationPrincipal Member admin
    ) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);

        if (prompt == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        }

        prompt.delete();
        promptRepository.save(prompt);

	recordAudit(
		admin,
		"PROMPT_HIDE",
		"PROMPT",
		id,
		"게시물 제목: "
			+ displayValue(prompt.getTitle(), "제목 없음")
			+ ", 작성자: "
			+ displayValue(prompt.getAuthorNickname(), "알 수 없음")
			+ ", 숨김 처리"
	);

        return ResponseEntity.ok(adminPromptMap(prompt));
    }

    @Transactional
    @PatchMapping("/prompts/{id}/restore")
    public ResponseEntity<?> restorePrompt(
            @PathVariable Long id,
            @AuthenticationPrincipal Member admin
    ) {
        PromptPost prompt = promptRepository.findById(id).orElse(null);

        if (prompt == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        }

        prompt.restore();
        promptRepository.save(prompt);

		recordAudit(
			admin,
			"PROMPT_RESTORE",
			"PROMPT",
			id,
			"게시물 제목: "
				+ displayValue(prompt.getTitle(), "제목 없음")
				+ ", 작성자: "
				+ displayValue(prompt.getAuthorNickname(), "알 수 없음")
				+ ", 숨김 해제"
		);

        return ResponseEntity.ok(adminPromptMap(prompt));
    }

    @GetMapping("/tags")
    public Map<String, Object> tags(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) Integer pageSize
    ) {
        String normalizedStatus =
                normalizeTagFilterStatus(status);

        List<Map<String, Object>> items =
                tagRepository.findAll().stream()
                        .filter(tag ->
                                "all".equals(normalizedStatus)
                                        || normalizedStatus.equals(
                                                tag.getStatus()
                                        )
                        )
                        .sorted(
                                Comparator.comparing(Tag::getCreatedAt)
                                        .reversed()
                                        .thenComparing(
                                                Tag::getId,
                                                Comparator.reverseOrder()
                                        )
                        )
                        .map(this::tagMap)
                        .toList();

        return pageResponse(items, page, size, pageSize);
    }

	@GetMapping("/tags/{id}/prompts")
	public Map<String, Object> tagPrompts(
		@PathVariable Long id,
		@RequestParam(defaultValue = "1") int page,
		@RequestParam(required = false) Integer size,
		@RequestParam(required = false) Integer pageSize
	) {
		Tag tag = tagRepository.findById(id)
			.orElseThrow(() -> new ResponseStatusException(
				HttpStatus.NOT_FOUND,
				"태그를 찾을 수 없습니다."
			));

		int resolvedSize = resolvePageSize(size, pageSize);
		int safePage = Math.max(page, 1);
		int safeSize = Math.min(Math.max(resolvedSize, 1), 100);

		Page<PromptPost> promptPage = promptRepository.findAllByExactTag(
			tag.getName(),
			PageRequest.of(safePage - 1, safeSize)
		);

		List<Map<String, Object>> items = promptPage.getContent().stream()
			.map(this::tagPromptMap)
			.toList();

		Map<String, Object> body = new LinkedHashMap<>();
		body.put("items", items);
		body.put("content", items);
		body.put("page", safePage);
		body.put("size", safeSize);
		body.put("total", promptPage.getTotalElements());
		body.put("totalPages", promptPage.getTotalPages());

		return body;
	}

    @Transactional
    @PatchMapping("/tags/{id}/status")
    public ResponseEntity<?> updateTagStatus(
            @PathVariable Long id,
            @RequestBody StatusRequest request,
            @AuthenticationPrincipal Member admin
    ) {
        Tag tag = tagRepository.findById(id).orElse(null);

        if (tag == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "요청한 대상을 찾을 수 없습니다.");
        }

        String previousStatus = tag.getStatus();

        TagStatus nextStatus = normalizeTagStatus(
                request.status(),
                TagStatus.APPROVED
        );

        if (!tag.canTransitionTo(nextStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "태그 상태를 "
                            + tag.getStatus()
                            + "에서 "
                            + nextStatus.value()
                            + "(으)로 변경할 수 없습니다."
            );
        }

        tag.changeStatus(nextStatus);
        tagRepository.save(tag);

		recordAudit(
				admin,
				"TAG_STATUS_CHANGE",
				"TAG",
				id,
				"태그명: "
						+ displayValue(tag.getName(), "알 수 없음")
						+ ", 상태: "
						+ previousStatus
						+ " -> "
						+ tag.getStatus()
		);

        return ResponseEntity.ok(tagMap(tag));

    }

    private Map<String, Object> auditLogMap(
            AdminAuditLog auditLog
    ) {
        Map<String, Object> body = new LinkedHashMap<>();

        body.put("id", auditLog.getId());

        body.put(
                "admin",
                new MemberSummaryResponse(
                        auditLog.getAdminId(),
                        auditLog.getAdminNickname()
                )
        );

        body.put("action", auditLog.getAction());
        body.put("targetType", auditLog.getTargetType());
        body.put("targetId", auditLog.getTargetId());
        body.put("detail", auditLog.getDetail());

        body.put(
                "createdAt",
                formatDateTime(auditLog.getCreatedAt())
        );

        return body;
    }

    private void recordAudit(
            Member admin,
            String action,
            String targetType,
            Long targetId,
            String detail
    ) {
        if (admin == null || admin.getId() == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "LOGIN_REQUIRED",
                    "관리자 로그인이 필요합니다."
            );
        }

        String adminNickname =
                admin.getNickname() == null
                        || admin.getNickname().isBlank()
                        ? "관리자"
                        : admin.getNickname();

        AdminAuditLog auditLog = new AdminAuditLog(
                admin.getId(),
                adminNickname,
                action,
                targetType,
                targetId,
                detail
        );

        adminAuditLogRepository.save(auditLog);
    }

    private Map<String, Object> pageResponse(
            List<Map<String, Object>> allItems,
            int page,
            Integer size,
            Integer pageSize
    ) {
        int resolvedSize = size != null
                ? size
                : (pageSize != null ? pageSize : 16);

        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(resolvedSize, 1), 100);

        int total = allItems.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<Map<String, Object>> items =
                allItems.subList(from, to);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0
                        ? 0
                        : (int) Math.ceil(
                                (double) total / safeSize
                        )
        );

        return body;
    }

	private Member requireMember(Long memberId) {
		return memberRepository.findById(memberId)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND,
						"회원을 찾을 수 없습니다."
				));
	}

	private Map<String, Object> adminUserCommentMap(
			Comment comment
	) {
		Map<String, Object> body = new LinkedHashMap<>();

		body.put("id", comment.getId());
		body.put("promptId", comment.getPromptId());
		body.put("parentId", comment.getParentId());
		body.put("text", comment.getText());
		body.put("preview", preview(comment.getText()));
		body.put("likes", comment.getLikes());
		body.put("edited", comment.isEdited());
		body.put("deleted", comment.isDeleted());
		body.put("hidden", comment.isHidden());

		body.put(
				"status",
				comment.isDeleted()
						? "deleted"
						: comment.isHidden()
						? "hidden"
						: "active"
		);

		Map<String, Object> author = new LinkedHashMap<>();
		author.put("id", comment.getAuthorId());
		author.put("nickname", comment.getAuthorNickname());

		body.put("author", author);
		body.put(
				"createdAt",
				formatDateTime(comment.getCreatedAt())
		);

		return body;
	}

	private Map<String, Object> memberSearchMap(Member member) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("id", member.getId());
		body.put("nickname", member.getNickname());
		body.put("active", member.isActive());
		body.put("blocked", member.isBlocked());
		return body;
	}

    private Map<String, Object> memberActivityMap(Member member) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", member.getId());
        body.put("userId", member.getUserId());
        body.put("nickname", member.getNickname());
        body.put("name", member.getName());
        body.put("role", member.getRole());
        body.put("active", member.isActive());
        body.put("createdAt", formatDateTime(member.getCreatedAt()));
        body.put("withdrawnAt", formatDateTime(member.getWithdrawnAt()));
        body.put("blocked", member.isBlocked());
        body.put("blockedAt", formatDateTime(member.getBlockedAt()));
        body.put("blockReason", member.getBlockReason());
        return body;
    }

    private ActivityItem promptActivity(PromptPost prompt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "prompt");
        body.put("id", prompt.getId());
        body.put("title", prompt.getTitle());
        body.put("preview", preview(prompt.getText()));
        body.put(
                "status",
                prompt.isDeleted()
                        ? "deleted"
                        : (prompt.isShared() ? "active" : "private")
        );
        body.put("shared", prompt.isShared());
        body.put("deleted", prompt.isDeleted());
        body.put("views", prompt.getViews());
        body.put("likes", prompt.getLikes());
        body.put("comments", prompt.getComments());
        body.put("saves", prompt.getSaves());
        body.put("createdAt", formatDateTime(prompt.getCreatedAt()));
        body.put("updatedAt", formatDateTime(prompt.getUpdatedAt()));
        body.put("occurredAt", formatDateTime(prompt.getUpdatedAt()));

        return new ActivityItem(prompt.getUpdatedAt(), body);
    }

    private ActivityItem commentActivity(Comment comment) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "comment");
        body.put("id", comment.getId());
        body.put("promptId", comment.getPromptId());
        body.put("parentId", comment.getParentId());
        body.put("preview", preview(comment.getText()));
        body.put("likes", comment.getLikes());
        body.put("edited", comment.isEdited());
        body.put("deleted", comment.isDeleted());
        body.put("hidden", comment.isHidden());
        body.put(
                "status",
                comment.isDeleted()
                        ? "deleted"
                        : (comment.isHidden() ? "hidden" : "active")
        );
        body.put("createdAt", formatDateTime(comment.getCreatedAt()));
        body.put("occurredAt", formatDateTime(comment.getCreatedAt()));

        return new ActivityItem(comment.getCreatedAt(), body);
    }

    private ActivityItem reportActivity(Report report) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "report");
        body.put("id", report.getId());
        body.put("targetType", report.getTargetType());
        body.put("targetId", report.getTargetId());
        body.put("reason", preview(report.getReason()));
        body.put("status", report.getStatus());
        body.put("memo", preview(report.getMemo()));
        body.put("reviewedAt", formatDateTime(report.getReviewedAt()));
        body.put("createdAt", formatDateTime(report.getCreatedAt()));
        body.put("occurredAt", formatDateTime(report.getCreatedAt()));

        return new ActivityItem(report.getCreatedAt(), body);
    }

    private ActivityItem makeThreadActivity(MakeThread thread) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "make_thread");
        body.put("id", thread.getId());
        body.put("folderId", thread.getFolderId());
        body.put("title", thread.getTitle());
        body.put("createdAt", formatDateTime(thread.getCreatedAt()));
        body.put("updatedAt", formatDateTime(thread.getUpdatedAt()));
        body.put("occurredAt", formatDateTime(thread.getUpdatedAt()));

        return new ActivityItem(thread.getUpdatedAt(), body);
    }

    private ActivityItem makeFolderActivity(MakeFolder folder) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "make_folder");
        body.put("id", folder.getId());
        body.put("name", folder.getName());
        body.put("createdAt", formatDateTime(folder.getCreatedAt()));
        body.put("occurredAt", formatDateTime(folder.getCreatedAt()));

        return new ActivityItem(folder.getCreatedAt(), body);
    }

    private String displayValue(
            String value,
            String fallback
    ) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        return value.trim();
    }

    private String preview(String text) {
        if (text == null) {
            return null;
        }

        String normalized = text.replaceAll("\\s+", " ").trim();

        if (normalized.length() <= 120) {
            return normalized;
        }

        return normalized.substring(0, 120) + "…";
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null
                ? null
                : value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    private boolean matchesPromptStatus(
            PromptPost prompt,
            String status
    ) {
        return switch (status) {
            case "active" -> !prompt.isDeleted() && prompt.isShared();
            case "private" -> !prompt.isDeleted() && !prompt.isShared();
            case "deleted" -> prompt.isDeleted();
            default -> true;
        };
    }

    private boolean matchesPromptQuery(
            PromptPost prompt,
            String query
    ) {
        if (query.isBlank()) {
            return true;
        }

        return containsIgnoreCase(prompt.getTitle(), query)
                || containsIgnoreCase(prompt.getText(), query)
                || containsIgnoreCase(prompt.getAuthorNickname(), query)
                || containsIgnoreCase(prompt.getTagsCsv(), query);
    }

    private boolean containsIgnoreCase(
            String value,
            String normalizedQuery
    ) {
        return value != null
                && value.toLowerCase(Locale.ROOT).contains(normalizedQuery);
    }

    private String normalizePromptStatus(String status) {
        String normalized = status == null || status.isBlank()
                ? "all"
                : status.trim().toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "all" -> "all";
            case "active", "shared", "visible" -> "active";
            case "private", "unshared" -> "private";
            case "deleted", "hidden" -> "deleted";
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 all, active, private, deleted 중 하나여야 합니다."
            );
        };
    }

    private Map<String, Object> adminPromptMap(PromptPost prompt) {
        Map<String, Object> body = new LinkedHashMap<>(
                PromptMapper.toPromptResponse(
                        prompt,
                        null,
                        false,
                        false
                )
        );

        body.put("deleted", prompt.isDeleted());
        body.put(
                "updatedAt",
                prompt.getUpdatedAt().format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                )
        );
        body.put(
                "status",
                prompt.isDeleted()
                        ? "deleted"
                        : (prompt.isShared() ? "active" : "private")
        );

        return body;
    }

	private Map<String, Object> tagPromptMap(PromptPost prompt) {
		String textPreview = preview(prompt.getText());

		Map<String, Object> author = new LinkedHashMap<>();
		author.put("id", prompt.getAuthorId());
		author.put("nickname", prompt.getAuthorNickname());

		Map<String, Object> body = new LinkedHashMap<>();
		body.put("id", prompt.getId());
		body.put("title", prompt.getTitle());
		body.put("text", textPreview);
		body.put("preview", textPreview);
		body.put("author", author);
		body.put("createdAt", formatDateTime(prompt.getCreatedAt()));
		body.put("isShared", prompt.isShared());
		body.put("isHidden", prompt.isDeleted());
		body.put(
			"status",
			prompt.isDeleted()
				? "deleted"
				: (prompt.isShared() ? "active" : "private")
		);

		return body;
	}

    private Map<String, Object> reportMap(Report report) {
        return reportResponseMapper.toResponse(report, true);
    }

    private Map<String, Object> tagMap(Tag tag) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", tag.getId());
        body.put("name", tag.getName());
        body.put("useCount", tag.getUseCount());
        body.put("count", tag.getUseCount());
        body.put("status", tag.getStatus());
        body.put(
                "createdAt",
                tag.getCreatedAt().format(
                        DateTimeFormatter.ISO_LOCAL_DATE_TIME
                )
        );
        return body;
    }

    private ReportStatus normalizeReportStatus(
            String status,
            ReportStatus defaultStatus
    ) {
        if (status == null || status.isBlank()) {
            return defaultStatus;
        }

        try {
            return ReportStatus.fromValue(status);
        }
        catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 pending, reviewed, resolved, dismissed 중 하나여야 합니다."
            );
        }
    }

    private String normalizeReportFilterStatus(String status) {
        if (status == null || status.isBlank()) {
            return "all";
        }

        String normalized =
                status.trim().toLowerCase(Locale.ROOT);

        if ("all".equals(normalized)) {
            return normalized;
        }

        return normalizeReportStatus(
                normalized,
                ReportStatus.PENDING
        ).value();
    }

    private TagStatus normalizeTagStatus(
            String status,
            TagStatus defaultStatus
    ) {
        if (status == null || status.isBlank()) {
            return defaultStatus;
        }

        try {
            return TagStatus.fromValue(status);
        }
        catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status는 pending, approved, rejected, disabled 중 하나여야 합니다."
            );
        }
    }

    private String normalizeTagFilterStatus(String status) {
        if (status == null || status.isBlank()) {
            return "all";
        }

        String normalized =
                status.trim().toLowerCase(Locale.ROOT);

        if ("all".equals(normalized)) {
            return normalized;
        }

        return normalizeTagStatus(
                normalized,
                TagStatus.APPROVED
        ).value();
    }

    private int resolvePageSize(
            Integer size,
            Integer pageSize
    ) {
        return size != null
                ? size
                : (pageSize != null ? pageSize : 16);
    }

    private <T> Map<String, Object> pageResponse(
            List<T> allItems,
            int page,
            int size
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        int total = allItems.size();
        long offset = (long) (safePage - 1) * safeSize;
        int from = (int) Math.min(offset, total);
        int to = Math.min(from + safeSize, total);

        List<T> items = allItems.subList(from, to);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("content", items);
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put(
                "totalPages",
                total == 0
                        ? 0
                        : (int) Math.ceil(
                                (double) total / safeSize
                        )
        );

        return body;
    }

    private record ActivityItem(
            LocalDateTime occurredAt,
            Map<String, Object> body
    ) {
    }

    public record StatusRequest(String status, String memo) {
    }

    public record BlockUserRequest(
        String reason
    ) {
    }

}
