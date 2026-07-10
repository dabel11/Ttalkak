package com.ttalkak.make;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MakeFolderRepository extends JpaRepository<MakeFolder, Long> {
    List<MakeFolder> findByMemberIdOrderByCreatedAtDesc(Long memberId);
    Optional<MakeFolder> findByIdAndMemberId(Long id, Long memberId);
    long countByMemberId(Long memberId);
}
