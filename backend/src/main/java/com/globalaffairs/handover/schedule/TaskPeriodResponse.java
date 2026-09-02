package com.globalaffairs.handover.schedule;

/**
 * One fixed period as the workspace reads it.
 *
 * <p>{@code startWeek} and {@code duration} are the slots the dates land on, sent alongside them so
 * the year track can place the task without re-deriving the mapping in the browser. The dates stay
 * the record; the slots are how a date-fixed task appears on a week-shaped view.
 */
public record TaskPeriodResponse(
        String taskKey,
        String personId,
        String taskTitle,
        String startsOn,
        String endsOn,
        int startWeek,
        int duration,
        String setBy) {

    static TaskPeriodResponse from(TaskPeriod period, int startWeek, int duration) {
        return new TaskPeriodResponse(
                period.getTaskKey(),
                period.getPersonId(),
                period.getTaskTitle(),
                period.getStartsOn().toString(),
                period.getEndsOn().toString(),
                startWeek,
                duration,
                period.getSetBy());
    }
}
