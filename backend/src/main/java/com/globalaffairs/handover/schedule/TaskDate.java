package com.globalaffairs.handover.schedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A confirmed calendar date inside a task's week span.
 *
 * <p>The plan is kept in week slots, which is the granularity the work is planned at and the one
 * the academic-year alignment moves things by. Some of the work underneath it is not planned at
 * all, though: an immigration office fixes the day of a group appointment, a university publishes
 * the day an application closes. Those dates are recorded here rather than by narrowing the plan,
 * so a five-week campaign stays a five-week campaign and still says which days matter inside it.
 *
 * <p>A task may carry several — a group appointment usually runs in more than one session.
 */
@Entity
@Table(
        name = "task_dates",
        uniqueConstraints = @UniqueConstraint(
                name = "task_dates_task_key_date_key",
                columnNames = {"task_key", "date"}))
public class TaskDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_key", nullable = false)
    private String taskKey;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(name = "task_title", nullable = false)
    private String taskTitle;

    @Column(nullable = false)
    private LocalDate date;

    /** What happens that day — "단체접수 1차", "원서접수 마감". Blank when the day speaks for itself. */
    @Column(nullable = false)
    private String label;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected TaskDate() {
        // for JPA
    }

    public TaskDate(
            String taskKey,
            String personId,
            String taskTitle,
            LocalDate date,
            String label,
            String createdBy,
            Instant createdAt) {
        this.taskKey = taskKey;
        this.personId = personId;
        this.taskTitle = taskTitle;
        this.date = date;
        this.label = label;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
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

    public LocalDate getDate() {
        return date;
    }

    public String getLabel() {
        return label;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
