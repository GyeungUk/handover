package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.web.Timestamps;

/**
 * One reschedule as the workspace reads it. Field names match the JSON the Next.js route produced,
 * which the frontend's {@code ScheduleChange} type is written against.
 */
public record ScheduleChangeResponse(
        String taskKey,
        String personId,
        String taskTitle,
        int fromStart,
        int toStart,
        String reason,
        String changedBy,
        String changedAt) {

    public static ScheduleChangeResponse from(TaskReschedule entity) {
        return new ScheduleChangeResponse(
                entity.getTaskKey(),
                entity.getPersonId(),
                entity.getTaskTitle(),
                entity.getFromStart(),
                entity.getToStart(),
                entity.getReason(),
                entity.getChangedBy(),
                Timestamps.toIsoString(entity.getChangedAt()));
    }
}
