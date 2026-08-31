package com.globalaffairs.handover.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

/**
 * One account's handover document: where it stands in the review workflow, and who last acted on it.
 *
 * <p>The entries and bundles that make up its content hang off this row by {@code ownerEmail}; see
 * {@link HandoverEntryRow} and {@link HandoverBundleRow}. Port of the {@code handover_documents}
 * table in {@code db/schema.ts}.
 */
@Entity
@Table(name = "handover_documents")
public class HandoverDocument {

    @Id
    @Column(name = "owner_email", nullable = false)
    private String ownerEmail;

    @Column(name = "owner_name", nullable = false)
    private String ownerName;

    @Column(nullable = false)
    private String status;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private String reviewedBy;

    /** Prevents a slow save in another tab from silently overwriting a newer whole-document save. */
    @Version
    @Column(nullable = false)
    private long version;

    protected HandoverDocument() {
        // for JPA
    }

    public HandoverDocument(String ownerEmail, String ownerName, String status, Instant updatedAt) {
        this.ownerEmail = ownerEmail;
        this.ownerName = ownerName;
        this.status = status;
        this.updatedAt = updatedAt;
    }

    public String getOwnerEmail() {
        return ownerEmail;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public String getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(String reviewedBy) {
        this.reviewedBy = reviewedBy;
    }
}
