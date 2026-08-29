package com.globalaffairs.handover.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A member an administrator has taken off the org chart. Restoring deletes the row. */
@Entity
@Table(name = "removed_members")
public class RemovedMember {

    @Id
    @Column(name = "person_id", nullable = false)
    private String personId;

    @Column(name = "removed_at", nullable = false)
    private Instant removedAt;

    protected RemovedMember() {
        // for JPA
    }

    public RemovedMember(String personId, Instant removedAt) {
        this.personId = personId;
        this.removedAt = removedAt;
    }

    public String getPersonId() {
        return personId;
    }

    public Instant getRemovedAt() {
        return removedAt;
    }

    public void setRemovedAt(Instant removedAt) {
        this.removedAt = removedAt;
    }
}
