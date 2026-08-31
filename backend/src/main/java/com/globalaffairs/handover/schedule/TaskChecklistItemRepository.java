package com.globalaffairs.handover.schedule;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskChecklistItemRepository extends JpaRepository<TaskChecklistItem, Long> {

    List<TaskChecklistItem> findByTaskKeyOrderByItemKey(String taskKey);

    Optional<TaskChecklistItem> findByTaskKeyAndItemKey(String taskKey, String itemKey);
}
