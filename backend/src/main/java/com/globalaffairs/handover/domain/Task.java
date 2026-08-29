package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * One planned unit of work on the 48-week academic-year grid.
 *
 * <p>Port of the {@code Task} type in {@code app/org-data.ts}. {@code movedFrom} is the week the
 * task originally started on, present only while a reschedule is in effect.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Task(String title, int start, int duration, String note, Integer movedFrom) {

    public Task withStart(int newStart) {
        return new Task(title, newStart, duration, note, start);
    }
}
