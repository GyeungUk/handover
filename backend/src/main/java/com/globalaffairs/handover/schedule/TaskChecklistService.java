package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads and updates the three durable handover checks shown in a task detail. */
@Service
public class TaskChecklistService {

    static final List<String> ITEM_KEYS = List.of("result-report", "schedule-share", "contact-refresh");

    private final TaskChecklistItemRepository repository;
    private final CustomTaskRepository customTasks;
    private final RemovedTaskRepository removedTasks;
    private final OrgData orgData;
    private final Clock clock;

    public TaskChecklistService(
            TaskChecklistItemRepository repository,
            CustomTaskRepository customTasks,
            RemovedTaskRepository removedTasks,
            OrgData orgData,
            Clock clock) {
        this.repository = repository;
        this.customTasks = customTasks;
        this.removedTasks = removedTasks;
        this.orgData = orgData;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TaskChecklistItemResponse> items(String personId, String taskTitle) {
        String key = requireTask(personId, taskTitle);
        Map<String, TaskChecklistItem> saved = repository.findByTaskKeyOrderByItemKey(key).stream()
                .collect(Collectors.toMap(TaskChecklistItem::getItemKey, Function.identity()));
        return ITEM_KEYS.stream()
                .map(itemKey -> saved.containsKey(itemKey)
                        ? TaskChecklistItemResponse.from(saved.get(itemKey))
                        : TaskChecklistItemResponse.empty(itemKey))
                .toList();
    }

    @Transactional
    public TaskChecklistItemResponse update(
            String personId,
            String taskTitle,
            String itemKey,
            Boolean completed,
            String updatedBy) {
        String key = requireTask(personId, taskTitle);
        if (!ITEM_KEYS.contains(itemKey) || completed == null) {
            throw ApiException.badRequest("유효한 체크 항목과 상태가 필요합니다.");
        }

        Instant now = Instant.now(clock);
        TaskChecklistItem item = repository.findByTaskKeyAndItemKey(key, itemKey)
                .map(current -> {
                    current.update(completed, updatedBy, now);
                    return current;
                })
                .orElseGet(() -> new TaskChecklistItem(
                        key, personId, taskTitle, itemKey, completed, updatedBy, now));
        return TaskChecklistItemResponse.from(repository.save(item));
    }

    private String requireTask(String personId, String taskTitle) {
        if (personId == null || personId.isBlank() || taskTitle == null || taskTitle.isBlank()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }
        String key = OrgData.taskKey(personId, taskTitle);
        boolean exists = customTasks.findByPersonIdAndTitle(personId, taskTitle).isPresent()
                || (!removedTasks.existsById(key) && orgData.findSeedTask(personId, taskTitle).isPresent());
        if (!exists) {
            throw ApiException.badRequest("존재하지 않는 업무입니다.");
        }
        return key;
    }
}
