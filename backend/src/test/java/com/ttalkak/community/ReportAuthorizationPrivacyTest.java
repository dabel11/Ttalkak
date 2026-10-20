package com.ttalkak.community;

import com.ttalkak.auth.AuthService;
import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptPost;
import com.ttalkak.prompt.PromptRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ReportAuthorizationPrivacyTest {
    private final PromptRepository prompts = mock(PromptRepository.class);
    private final CommentRepository comments = mock(CommentRepository.class);
    private final ReportRepository reports = mock(ReportRepository.class);
    private final AuthService auth = mock(AuthService.class);
    private final ReportResponseMapper mapper = spy(new ReportResponseMapper(
            mock(MemberRepository.class), prompts, comments));
    private final ReportController controller = new ReportController(reports, auth, mapper);
    private final PromptPost post = new PromptPost(8L, "owner", "private title",
            "private body", "", true);
    private final ReportController.ReportRequest request = new ReportController.ReportRequest("complaint");

    private void setUpTarget() {
        when(auth.currentMemberIdOrNull("member")).thenReturn(7L);
        when(prompts.findById(10L)).thenReturn(Optional.of(post));
        when(comments.findById(33L)).thenReturn(Optional.of(
                new Comment(10L, 32L, 9L, "comment author", "comment body")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"private", "deleted", "missing"})
    void inaccessiblePromptAndParentNeverPersistReports(String state) {
        setUpTarget();
        if (state.equals("private")) post.changeVisibility(false);
        if (state.equals("deleted")) when(prompts.findById(10L)).thenReturn(Optional.of(deletedPost()));
        if (state.equals("missing")) when(prompts.findById(10L)).thenReturn(Optional.empty());
        assertNotFound(() -> controller.reportPrompt(10L, request, "member"));
        assertNotFound(() -> controller.reportComment(33L, request, "member"));
        verifyNoInteractions(reports);
    }

    @ParameterizedTest
    @ValueSource(strings = {"hidden", "deleted", "missing"})
    void unavailableCommentsNeverPersistReports(String state) {
        setUpTarget();
        Comment comment = mock(Comment.class);
        when(comment.isHidden()).thenReturn(state.equals("hidden"));
        when(comment.isDeleted()).thenReturn(state.equals("deleted"));
        when(comments.findById(33L)).thenReturn(state.equals("missing")
                ? Optional.empty() : Optional.of(comment));
        assertNotFound(() -> controller.reportComment(33L, request, "member"));
        verifyNoInteractions(reports);
    }

    @Test
    void allowedReportsCheckAccessBeforeSavingAndUseReporterResponse() {
        setUpTarget();
        when(reports.save(any(Report.class))).thenAnswer(call -> call.getArgument(0));
        assertNull(controller.reportPrompt(10L, request, "member").get("memo"));
        assertNull(controller.reportComment(33L, request, "member").get("memo"));
        var order = inOrder(mapper, reports);
        order.verify(mapper).requireReportablePrompt(10L, 7L);
        order.verify(reports).save(any(Report.class));
        order.verify(mapper).toResponseForReporter(any(Report.class), eq(7L));
        order.verify(mapper).requireReportableComment(33L, 7L);
        order.verify(reports).save(any(Report.class));
        order.verify(mapper).toResponseForReporter(any(Report.class), eq(7L));
    }

    @Test
    void unauthenticatedRequestsNeverReachAccessLookupOrStorage() {
        assertEquals(401, assertThrows(ResponseStatusException.class,
                () -> controller.reportPrompt(10L, request, null)).getStatusCode().value());
        assertEquals(401, assertThrows(ResponseStatusException.class,
                () -> controller.reportComment(33L, request, null)).getStatusCode().value());
        verifyNoInteractions(mapper, reports, prompts, comments);
    }

    private PromptPost deletedPost() {
        PromptPost deleted = mock(PromptPost.class);
        when(deleted.isDeleted()).thenReturn(true);
        return deleted;
    }

    private void assertNotFound(org.junit.jupiter.api.function.Executable action) {
        assertEquals(404, assertThrows(ResponseStatusException.class, action).getStatusCode().value());
    }
}
