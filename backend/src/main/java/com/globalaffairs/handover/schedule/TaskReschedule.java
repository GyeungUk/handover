package com.globalaffairs.handover.schedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One recorded move of a task to a different start week.
 *
 * <p>The table is append-only: the highest id for a {@code taskKey} holds the task's current start,
 * and the rows before it are its history.
 */
@Entity
@Table(name = "task_reschedules")
public class TaskReschedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_key", nullable = false)
    private String taskKey;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(name = "task_title", nullable = false)
    private String taskTitle;

    @Column(name = "from_start", nullable = false)
    private int fromStart;

    @Column(name = "to_start", nullable = false)
    private int toStart;

    @Column(nullable = false)
    private String reason;

    @Column(name = "changed_by", nullable = false)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    protected TaskReschedule() {
        // for JPA
    }

    public TaskReschedule(
            String taskKey,
            String personId,
            String taskTitle,
            int fromStart,
            int toStart,
            String reason,
            String changedBy,
            Instant changedAt) {
        this.taskKey = taskKey;
        this.personId = personId;
        this.taskTitle = taskTitle;
        this.fromStart = fromStart;
        this.toStart = toStart;
        this.reason = reason;
        this.changedBy = changedBy;
        this.changedAt = changedAt;
    }

    public Long getId() {
        return id;
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

    public int getFromStart() {
        return fromStart;
    }

    public int getToStart() {
        return toStart;
    }

    public String getReason() {
        return reason;
    }

    public String getChangedBy() {
        return changedBy;
    }

    public Instant getChangedAt() {
        return changedAt;
    }
}
