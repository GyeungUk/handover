package com.globalaffairs.handover.schedule;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskDateRepository extends JpaRepository<TaskDate, Long> {

    /** Every confirmed date, in the order the calendar reads them. */
    List<TaskDate> findAllByOrderByDateAscIdAsc();

    List<TaskDate> findByTaskKeyOrderByDateAscIdAsc(String taskKey);

    boolean existsByTaskKeyAndDate(String taskKey, LocalDate date);

    long countByTaskKey(String taskKey);

    /** Drops a deleted task's confirmed dates. */
    void deleteByTaskKey(String taskKey);
}
