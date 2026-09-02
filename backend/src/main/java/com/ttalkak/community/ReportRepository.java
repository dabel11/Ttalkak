package com.ttalkak.community;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ReportRepository extends JpaRepository<Report, Long> {
    List<Report> findByReporterIdOrderByCreatedAtDesc(Long reporterId);

    long countByTargetTypeAndTargetIdIn(
        String targetType,
        List<Long> targetIds
    );

    List<Report> findByTargetTypeAndTargetIdInOrderByCreatedAtDesc(
            String targetType,
            List<Long> targetIds
    );
}
