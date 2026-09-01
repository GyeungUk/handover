package com.globalaffairs.handover.schedule;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RemovedTaskRepository extends JpaRepository<RemovedTask, String> {

    /** Every deleted seed task, in the order the frontend filters them out with. */
    List<RemovedTask> findAllByOrderByTaskKeyAsc();
}
