package com.ttalkak.prompt;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PromptAuthorRevisionRequestTest {

    @Test
    void cannotCompleteBeforeAcknowledgement() {
        PromptAuthorRevisionRequest request = createRequest();

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                request::complete
        );

        assertEquals(
                "확인한 수정 요청만 완료 처리할 수 있습니다.",
                exception.getMessage()
        );
        assertEquals("pending", request.getStatus());
    }

    @Test
    void cannotRejectBeforeAcknowledgement() {
        PromptAuthorRevisionRequest request = createRequest();

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                request::reject
        );

        assertEquals(
                "확인한 수정 요청만 거절 처리할 수 있습니다.",
                exception.getMessage()
        );
        assertEquals("pending", request.getStatus());
    }

    @Test
    void canCompleteAfterAcknowledgement() {
        PromptAuthorRevisionRequest request = createRequest();

        request.acknowledge();

        assertEquals("acknowledged", request.getStatus());
        assertNotNull(request.getAcknowledgedAt());

        request.complete();

        assertEquals("completed", request.getStatus());
        assertNotNull(request.getResolvedAt());
    }

    @Test
    void canRejectAfterAcknowledgement() {
        PromptAuthorRevisionRequest request = createRequest();

        request.acknowledge();
        request.reject();

        assertEquals("rejected", request.getStatus());
        assertNotNull(request.getAcknowledgedAt());
        assertNotNull(request.getResolvedAt());
    }


    @Test
    void canUpdateMessageWhilePending() {
        PromptAuthorRevisionRequest request = createRequest();

        request.updateMessage("updated message");

        assertEquals("updated message", request.getMessage());
        assertEquals("pending", request.getStatus());
    }

    @Test
    void cannotUpdateMessageAfterAcknowledgement() {
        PromptAuthorRevisionRequest request = createRequest();
        request.acknowledge();

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> request.updateMessage("updated message")
        );

        assertEquals(
                "\uB300\uAE30 \uC911\uC778 "
                        + "\uC218\uC815 \uC694\uCCAD\uB9CC "
                        + "\uB0B4\uC6A9\uC744 \uC218\uC815\uD560 "
                        + "\uC218 \uC788\uC2B5\uB2C8\uB2E4.",
                exception.getMessage()
        );
    }

    private PromptAuthorRevisionRequest createRequest() {
        return new PromptAuthorRevisionRequest(
                1L,
                "테스트 프롬프트",
                2L,
                "작성자",
                3L,
                "관리자",
                "수정 요청 내용"
        );
    }
}
