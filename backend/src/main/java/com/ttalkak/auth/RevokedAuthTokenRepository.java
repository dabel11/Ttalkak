package com.ttalkak.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

public interface RevokedAuthTokenRepository extends JpaRepository<RevokedAuthToken, String> {
    @Modifying
    @Transactional
    @Query("delete from RevokedAuthToken r where r.expiresAt < :now")
    void deleteExpired(@org.springframework.data.repository.query.Param("now") Instant now);
}
