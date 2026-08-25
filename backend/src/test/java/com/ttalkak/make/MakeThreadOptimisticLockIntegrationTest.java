package com.ttalkak.make;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "JWT_SECRET_BASE64="
                + "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
})
class MakeThreadOptimisticLockIntegrationTest {

    @Autowired
    private MakeThreadRepository threadRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void rejectsStaleThreadUpdateInsteadOfOverwritingNewerMessages() {
        MakeThread created = inTransaction(() ->
                threadRepository.saveAndFlush(
                        new MakeThread(
                                7L,
                                "동시성 테스트",
                                "[]",
                                null
                        )
                )
        );

        Long threadId = created.getId();

        try {
            MakeThread firstRequest = inTransaction(() ->
                    threadRepository.findById(threadId)
                            .orElseThrow()
            );

            MakeThread secondRequest = inTransaction(() ->
                    threadRepository.findById(threadId)
                            .orElseThrow()
            );

            firstRequest.update(
                    "첫 번째 요청",
                    """
                    [
                      {
                        "role": "user",
                        "content": "먼저 저장된 요청"
                      }
                    ]
                    """,
                    null
            );

            inTransaction(() ->
                    threadRepository.saveAndFlush(firstRequest)
            );

            secondRequest.update(
                    "두 번째 요청",
                    """
                    [
                      {
                        "role": "user",
                        "content": "늦게 저장된 요청"
                      }
                    ]
                    """,
                    null
            );

            assertThatThrownBy(() ->
                    inTransaction(() ->
                            threadRepository.saveAndFlush(secondRequest)
                    )
            ).isInstanceOf(
                    ObjectOptimisticLockingFailureException.class
            );
        } finally {
            inTransaction(() -> {
                threadRepository.deleteById(threadId);
                threadRepository.flush();
                return null;
            });
        }
    }

    private <T> T inTransaction(Supplier<T> action) {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);

        return transactionTemplate.execute(
                status -> action.get()
        );
    }
}