package com.ttalkak.make;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MakeThreadRepository extends JpaRepository<MakeThread, Long> {
    List<MakeThread> findByMemberIdOrderByUpdatedAtDesc(Long memberId);
}
