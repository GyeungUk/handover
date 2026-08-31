package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.Task;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A calendar task created in the workspace rather than shipped in the seed plan. */
@Entity
@Table(name = "custom_tasks")
public class CustomTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(nullable = false)
    private String title;

    @Column(name = "start_week", nullable = false)
    private int start;

    @Column(nullable = false)
    private int duration;

    @Column(nullable = false)
    private String note;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CustomTask() {}

    public CustomTask(
            String personId, String title, int start, int duration, String note, String createdBy, Instant createdAt) {
        this.personId = personId;
        this.title = title;
        this.start = start;
        this.duration = duration;
        this.note = note;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getPersonId() { return personId; }
    public String getTitle() { return title; }
    public int getStart() { return start; }
    public int getDuration() { return duration; }
    public String getNote() { return note; }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }

    public Task asTask() {
        return new Task(title, start, duration, note, null);
    }
}
