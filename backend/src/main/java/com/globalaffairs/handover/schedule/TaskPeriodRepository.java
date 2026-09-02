package com.globalaffairs.handover.schedule;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskPeriodRepository extends JpaRepository<TaskPeriod, String> {

    List<TaskPeriod> findAllByOrderByStartsOnAscTaskKeyAsc();

    /** One person's fixed periods, for the readers that reason about a single calendar. */
    List<TaskPeriod> findByPersonIdOrderByStartsOnAsc(String personId);

    void deleteByTaskKey(String taskKey);
}
