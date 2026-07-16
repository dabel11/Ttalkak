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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminControllerTest {

    private MemberRepository memberRepository;
    private AdminController controller;

    @BeforeEach
    void setUp() {
        ReportRepository reportRepository =
                mock(ReportRepository.class);

        ReportResponseMapper reportResponseMapper =
                mock(ReportResponseMapper.class);

        PromptRepository promptRepository =
                mock(PromptRepository.class);

        TagRepository tagRepository =
                mock(TagRepository.class);

        memberRepository =
                mock(MemberRepository.class);

        CommentRepository commentRepository =
                mock(CommentRepository.class);

        MakeThreadRepository makeThreadRepository =
                mock(MakeThreadRepository.class);

        MakeFolderRepository makeFolderRepository =
                mock(MakeFolderRepository.class);

        controller = new AdminController(
                reportRepository,
                reportResponseMapper,
                promptRepository,
                tagRepository,
                memberRepository,
                commentRepository,
                makeThreadRepository,
                makeFolderRepository
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
                )
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
    }

    @Test
    void unblocksBlockedUser() {
        Member member = localMember();
        member.block("반복적인 이용약관 위반");

        when(memberRepository.findById(1L))
                .thenReturn(Optional.of(member));

        Map<String, Object> response =
                controller.unblockUser(1L);

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
}