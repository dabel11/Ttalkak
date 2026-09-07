package com.ttalkak.prompt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TagRepository extends JpaRepository<Tag, Long> {

    Optional<Tag> findByName(String name);

    List<Tag> findByStatusOrderByUseCountDesc(
            TagStatus status
    );

    List<Tag>
    findByNameContainingIgnoreCaseAndStatusOrderByUseCountDesc(
            String query,
            TagStatus status
    );
}
