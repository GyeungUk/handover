package com.globalaffairs.handover.member;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomMemberRepository extends JpaRepository<CustomMember, String> {
    List<CustomMember> findAllByOrderByCreatedAtAsc();
}
