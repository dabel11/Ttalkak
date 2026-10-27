package com.ttalkak.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.function.LongSupplier;

@Component
public class SharedAuthRequestLimiter implements AuthRequestLimiter {
    private static final long WINDOW_MS = 60_000;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final SecretKeySpec identityKey;
    private final LongSupplier databaseClock;

    @Autowired
    public SharedAuthRequestLimiter(DataSource source, PlatformTransactionManager manager,
                                    @Value("${ttalkak.jwt.secret-base64:}") String secret) {
        this(source, manager, secret, null);
    }

    // Clock injection is limited to deterministic store tests. Application uses the DB clock.
    SharedAuthRequestLimiter(DataSource source, PlatformTransactionManager manager, String secret, LongSupplier clock) {
        jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(3);
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setTimeout(5);
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(secret.trim()); }
        catch (RuntimeException ex) { throw new IllegalStateException("Invalid shared authentication limiter key", ex); }
        if (bytes.length < 32) throw new IllegalStateException("Invalid shared authentication limiter key");
        identityKey = new SecretKeySpec(bytes, "HmacSHA256");
        if (clock != null) databaseClock = clock;
        else {
            String product;
            try (var connection = source.getConnection()) { product = connection.getMetaData().getDatabaseProductName(); }
            catch (java.sql.SQLException ex) { throw new IllegalStateException("Cannot initialize authentication limiter", ex); }
            String sql = product.equals("H2")
                    ? "SELECT DATEDIFF('MILLISECOND', TIMESTAMP WITH TIME ZONE '1970-01-01 00:00:00+00', CURRENT_TIMESTAMP(3))"
                    : "SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS SIGNED)";
            databaseClock = () -> jdbc.queryForObject(sql, Long.class);
        }
    }

    @Override public boolean allow(String address, String path) {
        String key = identity(address, path);
        return Boolean.TRUE.equals(transaction.execute(status -> {
            // Atomic upsert acquires the same row lock for first and subsequent requests.
            // No live key eviction or shared overflow bucket can reset somebody else's quota.
            jdbc.update("INSERT INTO auth_rate_limit_state (bucket_key, accepted_at, expires_at) VALUES (?, '', 0) "
                    + "ON DUPLICATE KEY UPDATE bucket_key=bucket_key", key);
            String encoded = jdbc.queryForObject("SELECT accepted_at FROM auth_rate_limit_state WHERE bucket_key=? FOR UPDATE",
                    String.class, key);
            long now = databaseClock.getAsLong(); // after the row lock, identical clock across replicas
            List<Long> accepted = decode(encoded);
            accepted.removeIf(time -> time <= now - WINDOW_MS);
            if (accepted.size() >= AuthRequestLimiter.limit(path)) return false;
            accepted.add(now);
            long expires = accepted.stream().mapToLong(Long::longValue).max().orElseThrow() + WINDOW_MS;
            jdbc.update("UPDATE auth_rate_limit_state SET accepted_at=?, expires_at=? WHERE bucket_key=?",
                    accepted.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",")), expires, key);
            return true;
        }));
    }

    private static List<Long> decode(String encoded) {
        var result = new ArrayList<Long>(30);
        if (!encoded.isEmpty()) {
            String[] parts = encoded.split(",", -1);
            if (parts.length > 30) throw new IllegalStateException("Invalid shared authentication limiter state");
            for (String part : parts) result.add(Long.parseLong(part));
        }
        return result;
    }

    private String identity(String address, String path) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(identityKey);
            // Domain separation prevents use of the JWT key as a signing oracle.
            return HexFormat.of().formatHex(mac.doFinal(("ttalkak-auth-limit-v1\0" + address + "\0" + path)
                    .getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) { throw new IllegalStateException("Cannot hash authentication limiter identity", ex); }
    }

    @Scheduled(fixedDelay = 5_000, initialDelay = 5_000)
    public void cleanupExpired() {
        try {
            // Bounded indexed cleanup; locked rows are rechecked by the database after waiting.
            jdbc.update("DELETE FROM auth_rate_limit_state WHERE expires_at<=? LIMIT 500", databaseClock.getAsLong());
        } catch (org.springframework.dao.DataAccessException ex) {
            org.slf4j.LoggerFactory.getLogger(SharedAuthRequestLimiter.class)
                    .warn("Authentication limiter expiry cleanup unavailable");
        }
    }
}
