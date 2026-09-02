package com.globalaffairs.handover.schedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A task's period as real dates, replacing the week slots it would otherwise be read from.
 *
 * <p>Most of the plan is deliberately vague about days. A five-week campaign runs "8월 2주부터
 * 5주간" because nobody decided it starts on the 8th, and pinning a date to it would invent a
 * precision the work does not have — and the academic-year alignment would then have nothing
 * sensible to move. Some work is not vague at all, though: the dates are published, the room is
 * booked, the deadline is the deadline. Those tasks carry a period here and the workspace draws
 * them on exactly those days.
 *
 * <p>Keyed by {@code task_key} rather than by a task id, so a seed task — which is code, not a row
 * — can carry one just as an authored task can. This is the same shape as {@code task_reschedules}
 * and {@code task_dates}, and one task has at most one period.
 */
@Entity
@Table(name = "task_periods")
public class TaskPeriod {

    @Id
    @Column(name = "task_key", nullable = false)
    private String taskKey;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(name = "task_title", nullable = false)
    private String taskTitle;

    @Column(name = "starts_on", nullable = false)
    private LocalDate startsOn;

    @Column(name = "ends_on", nullable = false)
    private LocalDate endsOn;

    @Column(name = "set_by", nullable = false)
    private String setBy;

    @Column(name = "set_at", nullable = false)
    private Instant setAt;

    protected TaskPeriod() {
        // for JPA
    }

    public TaskPeriod(
            String taskKey,
            String personId,
            String taskTitle,
            LocalDate startsOn,
            LocalDate endsOn,
            String setBy,
            Instant setAt) {
        this.taskKey = taskKey;
        this.personId = personId;
        this.taskTitle = taskTitle;
        this.startsOn = startsOn;
        this.endsOn = endsOn;
        this.setBy = setBy;
        this.setAt = setAt;
    }

    /** Overwriting in place rather than deleting and re-inserting keeps the key's identity stable. */
    public void moveTo(LocalDate newStartsOn, LocalDate newEndsOn, String changedBy, Instant changedAt) {
        this.startsOn = newStartsOn;
        this.endsOn = newEndsOn;
        this.setBy = changedBy;
        this.setAt = changedAt;
    }

    public String getTaskKey() {
        return taskKey;
    }

    public String getPersonId() {
        return personId;
    }

    public String getTaskTitle() {
        return taskTitle;
    }

    public LocalDate getStartsOn() {
        return startsOn;
    }

    public LocalDate getEndsOn() {
        return endsOn;
    }

    public String getSetBy() {
        return setBy;
    }

    public Instant getSetAt() {
        return setAt;
    }
}
