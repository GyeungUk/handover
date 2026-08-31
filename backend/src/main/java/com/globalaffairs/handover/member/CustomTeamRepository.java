package com.globalaffairs.handover.member;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomTeamRepository extends JpaRepository<CustomTeam, String> {
    List<CustomTeam> findAllByOrderByCreatedAtAsc();
}
