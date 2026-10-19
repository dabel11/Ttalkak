package com.ttalkak.community;

import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptRepository;
import com.ttalkak.prompt.PromptPost;
import java.util.Optional;
import static org.mockito.Mockito.when;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class ReportResponsePrivacyTest {

    private final ReportResponseMapper mapper = new ReportResponseMapper(
            mock(MemberRepository.class),
            mock(PromptRepository.class),
            mock(CommentRepository.class)
    );

    @Test
    void reporterCannotReadInternalModerationMemo() {
        Report report = new Report("prompt", 99L, 7L, "reported by a member");
        report.changeStatus(ReportStatus.REVIEWED, "INTERNAL_ONLY_MODERATOR_NOTE");

        Map<String, Object> reporterView = mapper.toResponseForReporter(report, 7L);
        assertTrue(reporterView.containsKey("memo"));
        assertNull(reporterView.get("memo"));
        assertEquals("reviewed", reporterView.get("status"));
        assertEquals("reported by a member", reporterView.get("reason"));

        // Administrator-facing context must still retain the review details.
        Map<String, Object> adminView = mapper.toResponse(report);
        assertEquals("INTERNAL_ONLY_MODERATOR_NOTE", adminView.get("memo"));
    }

    @Test
    void reportHistoryRedactsModeratorMemoAlsoForCommentReports() {
        Report report = new Report("comment", 33L, 7L, "comment complaint");
        report.changeStatus(ReportStatus.RESOLVED, "confidential action details");

        Map<String, Object> reporterView = mapper.toResponseForReporter(report, 7L);
        assertNull(reporterView.get("memo"));
        assertEquals("comment", reporterView.get("targetType"));
        assertEquals("resolved", reporterView.get("status"));
    }
    @Test
    void hiddenCommentReportHistoryDoesNotRevealCommentAuthor() {
        MemberRepository members = mock(MemberRepository.class);
        PromptRepository prompts = mock(PromptRepository.class);
        CommentRepository comments = mock(CommentRepository.class);
        ReportResponseMapper subject = new ReportResponseMapper(members, prompts, comments);

        PromptPost post = mock(PromptPost.class);
        when(post.isShared()).thenReturn(true);
        when(post.isDeleted()).thenReturn(false);
        Comment comment = new Comment(10L, null, 8L, "private nickname", "private complaint text");
        comment.hide();
        when(prompts.findById(10L)).thenReturn(Optional.of(post));
        when(comments.findById(33L)).thenReturn(Optional.of(comment));

        Report report = new Report("comment", 33L, 7L, "complaint");
        Map<String, Object> history = subject.toResponseForReporter(report, 7L);

        assertNull(history.get("author"));
        assertNull(history.get("commentContent"));
        assertNull(history.get("targetPreview"));
        assertEquals("complaint", history.get("reason"));
    }

}
