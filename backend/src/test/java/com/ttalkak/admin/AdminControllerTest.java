package com.ttalkak.admin;

import com.ttalkak.community.CommentRepository;
import com.ttalkak.community.ReportRepository;
import com.ttalkak.community.ReportResponseMapper;
import com.ttalkak.make.MakeFolderRepository;
import com.ttalkak.make.MakeThreadRepository;
import com.ttalkak.member.Member;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.TagRepository;
import com.ttalkak.common.exception.ApiException;
import com.ttalkak.community.Comment;
import com.ttalkak.community.Report;
import com.ttalkak.prompt.PromptPost;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class AdminControllerTest {

    private MemberRepository memberRepository;
    private AdminController controller;
    private AdminAuditLogRepository adminAuditLogRepository;
	private ReportRepository reportRepository;
	private PromptRepository promptRepository;
	private CommentRepository commentRepository;

    @BeforeEach
    void setUp() {
        reportRepository =
                mock(ReportRepository.class);

        ReportResponseMapper reportResponseMapper =
                mock(ReportResponseMapper.class);

        promptRepository =
                mock(PromptRepository.class);

        TagRepository tagRepository =
                mock(TagRepository.class);

        memberRepository =
                mock(MemberRepository.class);

        commentRepository =
                mock(CommentRepository.class);

        MakeThreadRepository makeThreadRepository =
                mock(MakeThreadRepository.class);

        MakeFolderRepository makeFolderRepository =
                mock(MakeFolderRepository.class);

        adminAuditLogRepository =
                mock(AdminAuditLogRepository.class);

        controller = new AdminController(
                reportRepository,
                reportResponseMapper,
                promptRepository,
                tagRepository,
                memberRepository,
                commentRepository,
                makeThreadRepository,
                makeFolderRepository,
                adminAuditLogRepository
        );
    }

	@Test
	void returnsUserCommentsInPagedResponse() {
		Member member = localMember();
		ReflectionTestUtils.setField(member, "id", 1L);

		Comment comment = new Comment(
				10L,
				null,
				1L,
				"test-nickname",
				"일반 댓글"
		);
		ReflectionTestUtils.setField(comment, "id", 20L);

		when(memberRepository.findById(1L))
				.thenReturn(Optional.of(member));

		when(commentRepository
				.findByAuthorIdAndParentIdIsNullOrderByCreatedAtDesc(
						1L
				))
				.thenReturn(List.of(comment));

		Map<String, Object> response = controller.userComments(
				1L,
				1,
				20,
				null
		);

		assertEquals(1, response.get("page"));
		assertEquals(20, response.get("size"));
		assertEquals(1, response.get("total"));

		List<?> items = (List<?>) response.get("items");
		assertEquals(1, items.size());

		Map<?, ?> item = (Map<?, ?>) items.get(0);
		Map<?, ?> author = (Map<?, ?>) item.get("author");

		assertEquals(20L, item.get("id"));
		assertEquals(10L, item.get("promptId"));
		assertEquals(null, item.get("parentId"));
		assertEquals("일반 댓글", item.get("text"));
		assertEquals("active", item.get("status"));

		assertEquals(1L, author.get("id"));
		assertEquals(
				"test-nickname",
				author.get("nickname")
		);

		verify(commentRepository)
				.findByAuthorIdAndParentIdIsNullOrderByCreatedAtDesc(
						1L
				);
	}

	@Test
	void returnsUserRepliesInPagedResponse() {
		Member member = localMember();
		ReflectionTestUtils.setField(member, "id", 1L);

		Comment reply = new Comment(
				10L,
				20L,
				1L,
				"test-nickname",
				"작성한 답글"
		);
		ReflectionTestUtils.setField(reply, "id", 21L);

		when(memberRepository.findById(1L))
				.thenReturn(Optional.of(member));

		when(commentRepository
				.findByAuthorIdAndParentIdIsNotNullOrderByCreatedAtDesc(
						1L
				))
				.thenReturn(List.of(reply));

		Map<String, Object> response = controller.userReplies(
				1L,
				1,
				20,
				null
		);

		assertEquals(1, response.get("page"));
		assertEquals(20, response.get("size"));
		assertEquals(1, response.get("total"));

		List<?> items = (List<?>) response.get("items");
		assertEquals(1, items.size());

		Map<?, ?> item = (Map<?, ?>) items.get(0);
		Map<?, ?> author = (Map<?, ?>) item.get("author");

		assertEquals(21L, item.get("id"));
		assertEquals(10L, item.get("promptId"));
		assertEquals(20L, item.get("parentId"));
		assertEquals("작성한 답글", item.get("text"));
		assertEquals("active", item.get("status"));

		assertEquals(1L, author.get("id"));
		assertEquals(
				"test-nickname",
				author.get("nickname")
		);

		verify(commentRepository)
				.findByAuthorIdAndParentIdIsNotNullOrderByCreatedAtDesc(
						1L
				);
	}

	@Test
	void returnsUserPromptsInPagedResponse() {
		Member member = localMember();
		ReflectionTestUtils.setField(member, "id", 1L);

		PromptPost prompt = new PromptPost(
				1L,
				"test-nickname",
				"테스트 프롬프트",
				"프롬프트 본문",
				"개발,테스트",
				true
		);
		ReflectionTestUtils.setField(prompt, "id", 10L);

		when(memberRepository.findById(1L))
				.thenReturn(Optional.of(member));

		when(promptRepository
				.findByAuthorIdOrderByUpdatedAtDesc(1L))
				.thenReturn(List.of(prompt));

		Map<String, Object> response =
				controller.userPrompts(
						1L,
						1,
						20,
						null
				);

		assertEquals(1, response.get("page"));
		assertEquals(20, response.get("size"));
		assertEquals(1, response.get("total"));

		List<?> items = (List<?>) response.get("items");

		assertEquals(1, items.size());

		Map<?, ?> item = (Map<?, ?>) items.get(0);
		Map<?, ?> author = (Map<?, ?>) item.get("author");

		assertEquals(10L, item.get("id"));
		assertEquals("테스트 프롬프트", item.get("title"));
		assertEquals("프롬프트 본문", item.get("text"));
		assertEquals("active", item.get("status"));
		assertEquals(false, item.get("deleted"));

		assertEquals(1L, author.get("id"));
		assertEquals(
				"test-nickname",
				author.get("nickname")
		);

		verify(promptRepository)
				.findByAuthorIdOrderByUpdatedAtDesc(1L);
	}

	@Test
	void rejectsUserPromptLookupForMissingUser() {
		when(memberRepository.findById(999L))
				.thenReturn(Optional.empty());

		ResponseStatusException exception = assertThrows(
				ResponseStatusException.class,
				() -> controller.userPrompts(
						999L,
						1,
						20,
						null
				)
		);

		assertEquals(
				HttpStatus.NOT_FOUND,
				exception.getStatusCode()
		);
	}

	@Test
	void returnsUserActivitySummary() {
		Member member = localMember();
		ReflectionTestUtils.setField(member, "id", 1L);

		PromptPost prompt = new PromptPost(
				1L,
				"test-nickname",
				"테스트 프롬프트",
				"프롬프트 내용",
				"테스트",
				true
		);
		ReflectionTestUtils.setField(prompt, "id", 10L);

		Comment comment = new Comment(
				10L,
				null,
				1L,
				"test-nickname",
				"일반 댓글"
		);
		ReflectionTestUtils.setField(comment, "id", 20L);

		Comment reply = new Comment(
				10L,
				20L,
				1L,
				"test-nickname",
				"답글"
		);
		ReflectionTestUtils.setField(reply, "id", 21L);

		Report submittedReport = new Report(
				"prompt",
				100L,
				1L,
				"신고 사유"
		);

		when(memberRepository.findById(1L))
				.thenReturn(Optional.of(member));

		when(promptRepository
				.findByAuthorIdOrderByUpdatedAtDesc(1L))
				.thenReturn(List.of(prompt));

		when(commentRepository
				.findByAuthorIdOrderByCreatedAtDesc(1L))
				.thenReturn(List.of(comment, reply));

		when(reportRepository
				.findByReporterIdOrderByCreatedAtDesc(1L))
				.thenReturn(List.of(submittedReport));

		when(reportRepository
				.countByTargetTypeAndTargetIdIn(
						"prompt",
						List.of(10L)
				))
				.thenReturn(2L);

		when(reportRepository
				.countByTargetTypeAndTargetIdIn(
						"comment",
						List.of(20L, 21L)
				))
				.thenReturn(3L);

		Map<String, Object> response =
				controller.userActivitySummary(1L);

		Map<?, ?> user =
				(Map<?, ?>) response.get("user");

		Map<?, ?> counts =
				(Map<?, ?>) response.get("counts");

		assertEquals(1L, user.get("id"));
		assertEquals("test-nickname", user.get("nickname"));

		assertEquals(1, counts.get("prompts"));
		assertEquals(1L, counts.get("comments"));
		assertEquals(1L, counts.get("replies"));
		assertEquals(1, counts.get("submittedReports"));
		assertEquals(5L, counts.get("receivedReports"));

		verify(reportRepository)
				.countByTargetTypeAndTargetIdIn(
						"prompt",
						List.of(10L)
				);

		verify(reportRepository)
				.countByTargetTypeAndTargetIdIn(
						"comment",
						List.of(20L, 21L)
				);
	}

	@Test
	void rejectsActivitySummaryForMissingUser() {
		when(memberRepository.findById(999L))
				.thenReturn(Optional.empty());

		ResponseStatusException exception = assertThrows(
				ResponseStatusException.class,
				() -> controller.userActivitySummary(999L)
		);

		assertEquals(
				HttpStatus.NOT_FOUND,
				exception.getStatusCode()
		);
	}

    @Test
    void blocksUserWithReason() {
        Member member = localMember();

        when(memberRepository.findById(1L))
                .thenReturn(Optional.of(member));

        Map<String, Object> response = controller.blockUser(
                1L,
                new AdminController.BlockUserRequest(
                        " 반복적인 이용약관 위반 "
                ),
                adminMember()
        );

        assertTrue(member.isBlocked());

        assertEquals(
                "반복적인 이용약관 위반",
                member.getBlockReason()
        );

        assertNotNull(member.getBlockedAt());

        assertEquals(
                true,
                response.get("blocked")
        );

        assertEquals(
                "반복적인 이용약관 위반",
                response.get("blockReason")
        );

        verify(memberRepository).save(member);

        ArgumentCaptor<AdminAuditLog> auditCaptor =
                ArgumentCaptor.forClass(AdminAuditLog.class);

        verify(adminAuditLogRepository)
                .save(auditCaptor.capture());

        AdminAuditLog auditLog = auditCaptor.getValue();

        assertEquals(99L, auditLog.getAdminId());
        assertEquals(
                "admin-nickname",
                auditLog.getAdminNickname()
        );
        assertEquals(
                "USER_BLOCK",
                auditLog.getAction()
        );
        assertEquals(
                "USER",
                auditLog.getTargetType()
        );
        assertEquals(1L, auditLog.getTargetId());

        assertNotNull(auditLog.getDetail());
        assertTrue(
                auditLog.getDetail()
                        .contains(member.getBlockReason())
        );
        assertNotNull(auditLog.getCreatedAt());
    }

    @Test
    void unblocksBlockedUser() {
        Member member = localMember();
        member.block("반복적인 이용약관 위반");

        when(memberRepository.findById(1L))
                .thenReturn(Optional.of(member));

        Map<String, Object> response =
            controller.unblockUser(
                    1L,
                    adminMember()
            );

        assertFalse(member.isBlocked());
        assertNull(member.getBlockReason());
        assertNull(member.getBlockedAt());

        assertEquals(
                false,
                response.get("blocked")
        );

        assertNull(response.get("blockReason"));
        assertNull(response.get("blockedAt"));

        verify(memberRepository).save(member);
        verify(adminAuditLogRepository)
        .save(any(AdminAuditLog.class));
    }

    @Test
    void returnsAuditLogsInPagedResponse() {
        AdminAuditLog auditLog = new AdminAuditLog(
                99L,
                "admin-nickname",
                "USER_BLOCK",
                "USER",
                1L,
                "차단 사유: 반복적인 이용약관 위반"
        );

        ReflectionTestUtils.setField(
                auditLog,
                "id",
                10L
        );

        when(adminAuditLogRepository
                .findAllByOrderByCreatedAtDescIdDesc())
                .thenReturn(List.of(auditLog));

        Map<String, Object> response =
                controller.auditLogs(
                        1,
                        null,
                        null
                );

        assertEquals(1, response.get("page"));
        assertEquals(1, response.get("total"));

        List<?> items =
                (List<?>) response.get("items");

        assertEquals(1, items.size());

        Map<?, ?> item =
                (Map<?, ?>) items.get(0);

        assertEquals(10L, item.get("id"));
        assertEquals(
                "USER_BLOCK",
                item.get("action")
        );
        assertEquals(
                "USER",
                item.get("targetType")
        );
        assertEquals(1L, item.get("targetId"));
        assertNotNull(item.get("admin"));
        assertNotNull(item.get("createdAt"));
    }

	@Test
	void searchesUsersByPartialNickname() {
		Member member = new Member(
				"copy-user",
				"encoded-password",
				"카피메이커",
				"Copy User",
				null,
				"010-2222-2222",
				"copy@example.com"
		);

		ReflectionTestUtils.setField(member, "id", 2L);

		when(
				memberRepository
						.findByNicknameContainingIgnoreCaseOrderByNicknameAsc(
								"카피"
						)
		).thenReturn(List.of(member));

		Map<String, Object> response = controller.searchUsers(
				" 카피 ",
				1,
				20,
				null
		);

		assertEquals(1, response.get("page"));
		assertEquals(20, response.get("size"));
		assertEquals(1, response.get("total"));

		List<?> items = (List<?>) response.get("items");

		assertEquals(1, items.size());

		Map<?, ?> item = (Map<?, ?>) items.get(0);

		assertEquals(2L, item.get("id"));
		assertEquals("카피메이커", item.get("nickname"));
		assertEquals(true, item.get("active"));
		assertEquals(false, item.get("blocked"));

		verify(memberRepository)
				.findByNicknameContainingIgnoreCaseOrderByNicknameAsc(
						"카피"
				);
	}

	@Test
	void rejectsBlankNicknameSearch() {
		assertThrows(
				ApiException.class,
				() -> controller.searchUsers(
						"   ",
						1,
						20,
						null
				)
		);
	}

    private Member localMember() {
        return new Member(
                "test-user",
                "encoded-password",
                "test-nickname",
                "Test User",
                null,
                "010-0000-0000",
                "test@example.com"
        );
    }

    private Member adminMember() {
        Member admin = new Member(
                "admin-user",
                "encoded-password",
                "admin-nickname",
                "Admin User",
                null,
                "010-1111-1111",
                "admin@example.com"
        );

        ReflectionTestUtils.setField(admin, "id", 99L);
        ReflectionTestUtils.setField(admin, "role", "ADMIN");

        return admin;
    }

}