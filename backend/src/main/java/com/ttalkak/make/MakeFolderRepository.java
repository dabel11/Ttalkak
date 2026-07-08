package com.ttalkak.make;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MakeFolderRepository extends JpaRepository<MakeFolder, Long> {
    List<MakeFolder> findByMemberIdOrderByCreatedAtDesc(Long memberId);
    long countByMemberId(Long memberId);
}
