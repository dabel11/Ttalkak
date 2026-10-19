package com.ttalkak.member;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberRepository
        extends JpaRepository<Member, Long> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from Member m where m.id = :id")
    Optional<Member> lockById(@org.springframework.data.repository.query.Param("id") Long id);

    Optional<Member> findByUserId(String userId);

    List<Member> findAllByNameAndEmailAndAuthProviderAndActiveTrue(
            String name, String email, String authProvider);

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
