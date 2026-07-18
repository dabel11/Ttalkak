package com.ttalkak.member;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberRepository
        extends JpaRepository<Member, Long> {

    Optional<Member> findByUserId(String userId);

    Optional<Member> findByUserIdAndActiveTrue(String userId);

    Optional<Member> findByUserIdAndAuthProviderAndActiveTrue(
            String userId,
            String authProvider
    );

    Optional<Member> findByIdAndActiveTrue(Long id);

    Optional<Member> findByNameAndPhone(
            String name,
            String phone
    );

    Optional<Member> findByNameAndEmail(
            String name,
            String email
    );

    Optional<Member> findByNameAndPhoneAndActiveTrue(
            String name,
            String phone
    );

    Optional<Member> findByNameAndPhoneAndAuthProviderAndActiveTrue(
            String name,
            String phone,
            String authProvider
    );

    Optional<Member> findByNameAndEmailAndActiveTrue(
            String name,
            String email
    );

    Optional<Member> findByNameAndEmailAndAuthProviderAndActiveTrue(
            String name,
            String email,
            String authProvider
    );

    Optional<Member> findByAuthProviderAndProviderSubject(
            String authProvider,
            String providerSubject
    );

List<Member> findByNicknameContainingIgnoreCaseOrderByNicknameAsc(
        String nickname
);

    boolean existsByUserId(String userId);

    boolean existsByNickname(String nickname);

    boolean existsByNicknameAndActiveTrue(String nickname);

    boolean existsByAuthProviderAndProviderSubject(
            String authProvider,
            String providerSubject
    );
}
