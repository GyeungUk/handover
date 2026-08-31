package com.globalaffairs.handover.schedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/** One saved checkbox in a calendar task's handover checklist. */
@Entity
@Table(
        name = "task_checklist_items",
        uniqueConstraints = @UniqueConstraint(
                name = "task_checklist_items_task_item_key",
                columnNames = {"task_key", "item_key"}))
public class TaskChecklistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_key", nullable = false)
    private String taskKey;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(name = "task_title", nullable = false)
    private String taskTitle;

    @Column(name = "item_key", nullable = false)
    private String itemKey;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "updated_by", nullable = false)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TaskChecklistItem() {
        // for JPA
    }

    public TaskChecklistItem(
            String taskKey,
            String personId,
            String taskTitle,
            String itemKey,
            boolean completed,
            String updatedBy,
            Instant updatedAt) {
        this.taskKey = taskKey;
        this.personId = personId;
        this.taskTitle = taskTitle;
        this.itemKey = itemKey;
        this.completed = completed;
        this.updatedBy = updatedBy;
        this.updatedAt = updatedAt;
    }

    public void update(boolean nextCompleted, String nextUpdatedBy, Instant nextUpdatedAt) {
        completed = nextCompleted;
        updatedBy = nextUpdatedBy;
        updatedAt = nextUpdatedAt;
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

    public String getItemKey() {
        return itemKey;
    }

    public boolean isCompleted() {
        return completed;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
