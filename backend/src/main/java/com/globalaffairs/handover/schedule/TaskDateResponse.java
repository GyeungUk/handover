package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.web.Timestamps;

/** One confirmed date as the workspace reads it. {@code date} is a plain {@code YYYY-MM-DD}. */
public record TaskDateResponse(
        Long id,
        String taskKey,
        String personId,
        String taskTitle,
        String date,
        String label,
        String createdBy,
        String createdAt) {

    static TaskDateResponse from(TaskDate saved) {
        return new TaskDateResponse(
                saved.getId(),
                saved.getTaskKey(),
                saved.getPersonId(),
                saved.getTaskTitle(),
                saved.getDate().toString(),
                saved.getLabel(),
                saved.getCreatedBy(),
                Timestamps.toIsoString(saved.getCreatedAt()));
    }
}
