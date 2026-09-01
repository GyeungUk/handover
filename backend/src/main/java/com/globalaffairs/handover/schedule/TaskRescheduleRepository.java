package com.globalaffairs.handover.schedule;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRescheduleRepository extends JpaRepository<TaskReschedule, Long> {

    /** The whole trail in insertion order, as {@code GET /api/schedules} returned it. */
    List<TaskReschedule> findAllByOrderByIdAsc();

    /** One person's trail in insertion order; the draft and calendar-check endpoints replay it. */
    List<TaskReschedule> findByPersonIdOrderByIdAsc(String personId);

    /** The move currently in effect for a task, if any. */
    Optional<TaskReschedule> findFirstByTaskKeyOrderByIdDesc(String taskKey);

    /** Drops a deleted task's whole trail; nothing may replay a move of a task that is gone. */
    void deleteByTaskKey(String taskKey);
}
