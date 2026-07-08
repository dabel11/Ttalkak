package com.ttalkak.member;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    Optional<Member> findByUserId(String userId);
    Optional<Member> findByNameAndPhone(String name, String phone);
    Optional<Member> findByNameAndEmail(String name, String email);
    boolean existsByUserId(String userId);
    boolean existsByNickname(String nickname);
}
