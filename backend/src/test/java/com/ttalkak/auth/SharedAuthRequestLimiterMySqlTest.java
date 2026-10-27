package com.ttalkak.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Existing disposable CI MySQL only; never an operator-supplied production URL. */
@EnabledIfEnvironmentVariable(named = "GITHUB_ACTIONS", matches = "true")
class SharedAuthRequestLimiterMySqlTest {
    @Test void realMySqlReplicasSerializeAndRetainStateAfterReconstruction() throws Exception {
        assertEquals("1", System.getenv("TTALKAK_AUTH_LIMITER_CI"), "explicit disposable limiter CI gate required");
        String url = System.getenv("DB_URL");
        assertNotNull(url);
        assertTrue(url.startsWith("jdbc:mysql://127.0.0.1:3306/ttalkak?"));
        var source = new DriverManagerDataSource(url, System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"));
        var jdbc = new JdbcTemplate(source);
        jdbc.execute("DROP TABLE IF EXISTS auth_rate_limit_state");
        try {
            try (var connection = source.getConnection()) {
                org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,
                        new org.springframework.core.io.FileSystemResource("docs/sql/20261028_auth_rate_limit_state.sql"));
            }
            var first = new SharedAuthRequestLimiter(source, new DataSourceTransactionManager(source), SharedAuthRequestLimiterTest.SECRET);
            var second = new SharedAuthRequestLimiter(source, new DataSourceTransactionManager(source), SharedAuthRequestLimiterTest.SECRET);
            var pool = Executors.newFixedThreadPool(8);
            var start = new CountDownLatch(1);
            try {
                var results = new java.util.ArrayList<Future<Boolean>>();
                for (int i = 0; i < 32; i++) {
                    var limiter = i % 2 == 0 ? first : second;
                    results.add(pool.submit(() -> { start.await(); return limiter.allow("203.0.113.7", SharedAuthRequestLimiterTest.PATH); }));
                }
                start.countDown();
                int accepted = 0;
                for (var result : results) if (result.get(20, TimeUnit.SECONDS)) accepted++;
                assertEquals(10, accepted);
            } finally { pool.shutdownNow(); }
            var replacement = new SharedAuthRequestLimiter(source, new DataSourceTransactionManager(source), SharedAuthRequestLimiterTest.SECRET);
            assertFalse(replacement.allow("203.0.113.7", SharedAuthRequestLimiterTest.PATH));
            assertTrue(replacement.allow("203.0.113.8", SharedAuthRequestLimiterTest.PATH));
            replacement.cleanupExpired();
            assertFalse(replacement.allow("203.0.113.7", SharedAuthRequestLimiterTest.PATH));
        } finally { jdbc.execute("DROP TABLE IF EXISTS auth_rate_limit_state"); }
    }
}
