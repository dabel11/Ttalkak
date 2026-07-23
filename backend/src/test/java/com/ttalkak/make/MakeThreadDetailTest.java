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
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MakeThreadDetailTest {

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
    void returnsOwnedThreadDetail() {
        MakeThread thread = new MakeThread(
                7L,
                "테스트 대화",
                """
                [
                  {
                    "id": "user-1",
                    "role": "user",
                    "content": "안녕하세요"
                  }
                ]
                """,
                null
        );

        ReflectionTestUtils.setField(thread, "id", 42L);

        when(authService.currentMemberIdOrNull("Bearer token"))
                .thenReturn(7L);
        when(threadRepository.findByIdAndMemberId(42L, 7L))
                .thenReturn(Optional.of(thread));

        Map<String, Object> response =
                controller.threadDetail("42", "Bearer token");

        assertThat(response.get("id")).isEqualTo(42L);
        assertThat(response.get("threadId")).isEqualTo(42L);
        assertThat(response.get("title")).isEqualTo("테스트 대화");

        List<?> messages = (List<?>) response.get("messages");
        assertThat(messages).hasSize(1);

        Map<?, ?> message = (Map<?, ?>) messages.get(0);
        assertThat(message.get("content")).isEqualTo("안녕하세요");
    }

    @Test
    void rejectsUnknownOrOtherUsersThread() {
        when(authService.currentMemberIdOrNull("Bearer token"))
                .thenReturn(7L);
        when(threadRepository.findByIdAndMemberId(42L, 7L))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                controller.threadDetail("42", "Bearer token")
        ).isInstanceOf(ApiException.class);
    }
}