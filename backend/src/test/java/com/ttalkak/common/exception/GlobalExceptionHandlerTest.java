package com.ttalkak.common.exception;

import com.ttalkak.make.MakeThread;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerTest {

    @Test
    void optimisticLockConflictReturnsStableApiError()
            throws Exception {
        MockMvc mockMvc = MockMvcBuilders
                .standaloneSetup(new ConflictController())
                .setControllerAdvice(
                        new GlobalExceptionHandler()
                )
                .build();

        mockMvc.perform(
                        get("/test/thread-conflict")
                )
                .andExpect(status().isConflict())
                .andExpect(
                        jsonPath("$.code").value(
                                "THREAD_CONCURRENTLY_UPDATED"
                        )
                )
                .andExpect(
                        jsonPath("$.message").value(
                                "대화가 다른 요청에 의해 변경되었습니다. 최신 대화를 불러온 뒤 다시 시도해 주세요."
                        )
                );
    }

    @RestController
    private static class ConflictController {

        @GetMapping("/test/thread-conflict")
        public void conflict() {
            throw new ObjectOptimisticLockingFailureException(
                    MakeThread.class,
                    42L
            );
        }
    }
}