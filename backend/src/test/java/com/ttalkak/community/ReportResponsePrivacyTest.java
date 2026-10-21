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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"private", "deleted", "missing"})
    void inaccessibleTargetHistoryRedactsBothPromptAndCommentContext(String state) {
        PromptRepository prompts = mock(PromptRepository.class);
        CommentRepository comments = mock(CommentRepository.class);
        ReportResponseMapper subject = new ReportResponseMapper(mock(MemberRepository.class), prompts, comments);
        PromptPost post = mock(PromptPost.class);
        when(post.getAuthorId()).thenReturn(8L);
        when(post.getAuthorNickname()).thenReturn("sensitive owner");
        when(post.getTitle()).thenReturn("sensitive title");
        when(post.getText()).thenReturn("sensitive body");
        when(post.isShared()).thenReturn(!state.equals("private"));
        when(post.isDeleted()).thenReturn(state.equals("deleted"));
        when(prompts.findById(10L)).thenReturn(state.equals("missing")
                ? Optional.empty() : Optional.of(post));
        when(comments.findById(33L)).thenReturn(Optional.of(
                new Comment(10L, 32L, 9L, "sensitive commenter", "sensitive comment")));
        for (Report report : new Report[]{new Report("prompt", 10L, 7L, "complaint"),
                new Report("comment", 33L, 7L, "complaint")}) {
            Map<String, Object> history = subject.toResponseForReporter(report, 7L);
            for (String field : new String[]{"targetPreview", "author", "promptTitle",
                    "promptContent", "promptAuthor", "commentContent", "memo",
                    "promptId", "parentId", "targetExists", "targetDeleted", "targetHidden"}) {
                assertTrue(history.containsKey(field), field);
                assertNull(history.get(field), state + ": " + field);
            }
            assertEquals("complaint", history.get("reason"));
            assertEquals(report.getTargetId(), history.get("targetId"));
        }
    }

    @Test
    void privateOwnerRetainsTargetContextWhileOtherReporterIsRedacted() {
        PromptRepository prompts = mock(PromptRepository.class);
        ReportResponseMapper subject = new ReportResponseMapper(mock(MemberRepository.class),
                prompts, mock(CommentRepository.class));
        PromptPost post = new PromptPost(8L, "owner", "owner title", "owner body", "", false);
        when(prompts.findById(10L)).thenReturn(Optional.of(post));
        Report report = new Report("prompt", 10L, 8L, "complaint");
        assertEquals("owner body", subject.toResponseForReporter(report, 8L).get("promptContent"));
        assertNull(subject.toResponseForReporter(report, 7L).get("promptContent"));
        assertEquals("owner body", subject.toResponse(report).get("promptContent"));
    }

}
