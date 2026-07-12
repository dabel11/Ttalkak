package com.ttalkak.member;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByUserId(String userId);

    Optional<Member> findByUserIdAndActiveTrue(String userId);

    Optional<Member> findByIdAndActiveTrue(Long id);

    Optional<Member> findByNameAndPhone(String name, String phone);

    Optional<Member> findByNameAndEmail(String name, String email);

    Optional<Member> findByNameAndPhoneAndActiveTrue(String name, String phone);

    Optional<Member> findByNameAndEmailAndActiveTrue(String name, String email);

    boolean existsByUserId(String userId);

    boolean existsByNickname(String nickname);

    boolean existsByNicknameAndActiveTrue(String nickname);
}