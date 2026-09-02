package com.globalaffairs.handover.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One 담당업무 unit: the entries a part leader approves or rejects together, plus the verdict they
 * left on it. {@code entryIds} is a JSON array of entry ids, written and read whole.
 */
@Entity
@Table(name = "handover_bundles")
public class HandoverBundleRow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_email", nullable = false)
    private String ownerEmail;

    @Column(name = "bundle_id", nullable = false)
    private String bundleId;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(nullable = false)
    private String title;

    @Column(name = "entry_ids", nullable = false)
    private String entryIds;

    @Column
    private String decision;

    @Column(name = "comment", nullable = false)
    private String comment;

    /** The rejection this unit was resubmitted against; empty once a new verdict answers it. */
    @Column(name = "previous_comment", nullable = false)
    private String previousComment;

    protected HandoverBundleRow() {
        // for JPA
    }

    public HandoverBundleRow(
            String ownerEmail,
            String bundleId,
            int position,
            String title,
            String entryIds,
            String decision,
            String comment,
            String previousComment) {
        this.ownerEmail = ownerEmail;
        this.bundleId = bundleId;
        this.position = position;
        this.title = title;
        this.entryIds = entryIds;
        this.decision = decision;
        this.comment = comment;
        this.previousComment = previousComment;
    }

    public Long getId() {
        return id;
    }

    public String getOwnerEmail() {
        return ownerEmail;
    }

    public String getBundleId() {
        return bundleId;
    }

    public int getPosition() {
        return position;
    }

    public String getTitle() {
        return title;
    }

    public String getEntryIds() {
        return entryIds;
    }

    public String getDecision() {
        return decision;
    }

    public String getComment() {
        return comment;
    }

    public String getPreviousComment() {
        return previousComment;
    }
}
