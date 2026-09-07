package com.ttalkak.make;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ttalkak.auth.AuthService;
import com.ttalkak.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MakeThreadWritePolicyTest {

    @Mock
    private MakeThreadRepository threadRepository;

    @Mock
    private MakeFolderRepository folderRepository;

    @Mock
    private AuthService authService;

    private MakeController controller;

    @BeforeEach
    void setUp() {
        controller = new MakeController(
                threadRepository,
                folderRepository,
                authService,
                new ObjectMapper()
        );
    }

    @Test
    void rejectsExistingThreadIdInCreateRequest() {
        when(authService.currentMemberIdOrNull("Bearer token"))
                .thenReturn(7L);

        MakeController.SaveThreadRequest request =
                new MakeController.SaveThreadRequest(
                        null,
                        42L,
                        "대화 제목",
                        List.of(),
                        null
                );

        assertThatThrownBy(() ->
                controller.saveThread(request, "Bearer token")
        ).isInstanceOf(ApiException.class);

        verify(threadRepository, never()).save(any());
    }

    @Test
    void updatePreservesServerMessagesAndFolder() {
        MakeThread thread = new MakeThread(
                7L,
                "기존 제목",
                """
                [
                  {
                    "id": "user-1",
                    "role": "user",
                    "content": "서버에 저장된 메시지"
                  }
                ]
                """,
                3L
        );

        ReflectionTestUtils.setField(thread, "id", 42L);

        when(authService.currentMemberIdOrNull("Bearer token"))
                .thenReturn(7L);
        when(threadRepository.findByIdAndMemberId(42L, 7L))
                .thenReturn(Optional.of(thread));
        when(threadRepository.save(thread))
                .thenReturn(thread);

        MakeController.SaveThreadRequest request =
                new MakeController.SaveThreadRequest(
                        null,
                        null,
                        "변경된 제목",
                        List.of(),
                        999L
                );

        controller.updateThread("42", request, "Bearer token");

        assertThat(thread.getTitle()).isEqualTo("변경된 제목");
        assertThat(thread.getMessagesJson())
                .contains("서버에 저장된 메시지");
        assertThat(thread.getFolderId()).isEqualTo(3L);
    }
}