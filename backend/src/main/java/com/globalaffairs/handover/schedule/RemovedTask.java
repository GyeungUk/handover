package com.globalaffairs.handover.schedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A task from the shipped seed plan that somebody deleted in the workspace.
 *
 * <p>Seed tasks are compiled into {@code domain/org-data.json} rather than stored in a table, so
 * there is no row to delete: the deletion is recorded here and every reader skips the key. Tasks
 * authored in the workspace are deleted from {@code custom_tasks} outright and never land here.
 */
@Entity
@Table(name = "removed_tasks")
public class RemovedTask {

    /** {@code personId::title} — the same identity a reschedule trail is filed under. */
    @Id
    @Column(name = "task_key", nullable = false)
    private String taskKey;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(nullable = false)
    private String title;

    @Column(name = "removed_by", nullable = false)
    private String removedBy;

    @Column(name = "removed_at", nullable = false)
    private Instant removedAt;

    protected RemovedTask() {}

    public RemovedTask(String taskKey, String personId, String title, String removedBy, Instant removedAt) {
        this.taskKey = taskKey;
        this.personId = personId;
        this.title = title;
        this.removedBy = removedBy;
        this.removedAt = removedAt;
    }

    public String getTaskKey() { return taskKey; }
    public String getPersonId() { return personId; }
    public String getTitle() { return title; }
    public String getRemovedBy() { return removedBy; }
    public Instant getRemovedAt() { return removedAt; }
}
