package com.ttalkak.community;

import com.ttalkak.member.MemberRepository;
import com.ttalkak.prompt.PromptRepository;
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
}
