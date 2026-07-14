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
