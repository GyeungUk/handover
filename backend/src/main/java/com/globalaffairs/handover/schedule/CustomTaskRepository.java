package com.globalaffairs.handover.schedule;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomTaskRepository extends JpaRepository<CustomTask, Long> {
    List<CustomTask> findAllByOrderByPersonIdAscStartAscIdAsc();
    Optional<CustomTask> findByPersonIdAndTitle(String personId, String title);
    boolean existsByPersonIdAndTitle(String personId, String title);
}
