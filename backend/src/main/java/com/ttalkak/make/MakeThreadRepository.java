package com.ttalkak.make;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MakeThreadRepository extends JpaRepository<MakeThread, Long> {
    List<MakeThread> findByMemberIdOrderByUpdatedAtDesc(Long memberId);
    Optional<MakeThread> findByIdAndMemberId(Long id, Long memberId);
    Optional<MakeThread> findByMemberIdAndInitialRequestId(Long memberId, String initialRequestId);
}
