package com.globalaffairs.handover.member;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RemovedMemberRepository extends JpaRepository<RemovedMember, String> {

    /** Newest removal first, matching {@code ORDER BY removed_at DESC} in the D1 route. */
    List<RemovedMember> findAllByOrderByRemovedAtDesc();
}
