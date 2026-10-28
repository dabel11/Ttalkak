package com.ttalkak.auth;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class SharedAuthRequestLimiterTest {
    static final String SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    static final String PATH = "/api/auth/id-recovery/request";
    final DriverManagerDataSource source = new DriverManagerDataSource(
            "jdbc:h2:mem:limiter-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=1000", "sa", "");
    final JdbcTemplate jdbc = new JdbcTemplate(source);
    final AtomicLong clock = new AtomicLong(1000);

    SharedAuthRequestLimiterTest() {
        jdbc.execute("CREATE TABLE auth_rate_limit_state (bucket_key VARCHAR(64) PRIMARY KEY, "
                + "accepted_at VARCHAR(1024) NOT NULL, expires_at BIGINT NOT NULL)");
        jdbc.execute("CREATE INDEX idx_auth_limit_expiry ON auth_rate_limit_state(expires_at)");
    }
    SharedAuthRequestLimiter instance() {
        return new SharedAuthRequestLimiter(source, new DataSourceTransactionManager(source), SECRET, clock::get);
    }

    @Test void startupProbeRollsBackWithoutLeavingState() {
        instance().validateStoreBeforeServing();
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM auth_rate_limit_state", Long.class));
    }

    @Test void missingSchemaFailsStartupValidation() {
        jdbc.execute("DROP TABLE auth_rate_limit_state");
        assertThrows(IllegalStateException.class, () -> instance().validateStoreBeforeServing());
    }

    @Test void missingExpiryIndexFailsStartupValidation() {
        jdbc.execute("DROP INDEX idx_auth_limit_expiry");
        assertThrows(IllegalStateException.class, () -> instance().validateStoreBeforeServing());
    }

    @Test void replicasAndReplacementShareOneAtomicAllowance() throws Exception {
        var first = instance(); var second = instance();
        var pool = Executors.newFixedThreadPool(8);
        var start = new CountDownLatch(1);
        var results = new java.util.ArrayList<Future<Boolean>>();
        try {
            for (int i = 0; i < 40; i++) {
                var limiter = i % 2 == 0 ? first : second;
                results.add(pool.submit(() -> { start.await(); return limiter.allow("203.0.113.7", PATH); }));
            }
            start.countDown();
            int accepted = 0;
            for (var result : results) if (result.get(20, TimeUnit.SECONDS)) accepted++;
            assertEquals(10, accepted);
            assertFalse(instance().allow("203.0.113.7", PATH), "new process fixture must not replenish quota");
            assertTrue(instance().allow("203.0.113.8", PATH));
        } finally { pool.shutdownNow(); }
    }

    @Test void exactWindowAndDeniedTrafficDoNotReleaseEarlyOrExtendExpiry() {
        var limiter = instance();
        for (int i = 0; i < 10; i++) assertTrue(limiter.allow("203.0.113.7", PATH));
        clock.set(60_999);
        for (int i = 0; i < 50; i++) assertFalse(limiter.allow("203.0.113.7", PATH));
        clock.set(61_000);
        assertTrue(limiter.allow("203.0.113.7", PATH));
    }

    @Test void manyNewIdentitiesDoNotCollideEvictOrExhaustTheOldKeyCap() {
        var limiter = instance();
        for (int i = 0; i < 10; i++) assertTrue(limiter.allow("existing", PATH));
        for (int i = 0; i < 10_050; i++) assertTrue(limiter.allow("fixture-" + i, PATH));
        assertFalse(limiter.allow("existing", PATH));
        for (int i = 0; i < 10; i++) assertTrue(limiter.allow("new-legitimate", PATH));
        assertFalse(limiter.allow("new-legitimate", PATH));
        assertTrue(limiter.allow("existing", "/api/auth/login"));
        assertEquals(10_053L, jdbc.queryForObject("SELECT COUNT(*) FROM auth_rate_limit_state", Long.class));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM auth_rate_limit_state WHERE LENGTH(bucket_key)<>64", Long.class));
    }

    @Test void outerBusinessRollbackCannotRefundAnAuthenticationAttempt() {
        var limiter = instance();
        var outer = new TransactionTemplate(new DataSourceTransactionManager(source));
        assertThrows(IllegalStateException.class, () -> outer.execute(status -> {
            for (int i = 0; i < 10; i++) assertTrue(limiter.allow("203.0.113.7", PATH));
            throw new IllegalStateException("controller failure fixture");
        }));
        assertFalse(instance().allow("203.0.113.7", PATH));
    }

    @Test void cleanupOnlyRemovesExpiredKeysAndDoesNotResetLiveQuota() {
        var limiter = instance();
        limiter.allow("expired", PATH);
        clock.set(30_000);
        for (int i = 0; i < 10; i++) assertTrue(limiter.allow("live", PATH));
        clock.set(61_000);
        limiter.cleanupExpired();
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM auth_rate_limit_state", Long.class));
        assertFalse(instance().allow("live", PATH));
        assertTrue(instance().allow("expired", PATH));
    }

    @Test void applicationClockIsNotNeededForTheDatabaseClockPath() {
        var limiter = new SharedAuthRequestLimiter(source, new DataSourceTransactionManager(source), SECRET);
        assertTrue(limiter.allow("203.0.113.7", PATH));
        long expiry = jdbc.queryForObject("SELECT expires_at FROM auth_rate_limit_state", Long.class);
        assertTrue(Math.abs(expiry - System.currentTimeMillis() - 60_000) < 5_000);
    }
}
