package com.globalaffairs.handover.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A separately saved working copy, always derived from an approved handover record. */
@Entity
@Table(name = "handover_draft_copies")
public class HandoverDraftCopy {
    @Id private String id;
    @Column(name = "owner_email", nullable = false) private String ownerEmail;
    @Column(name = "source_academic_year", nullable = false) private int sourceAcademicYear;
    @Column(nullable = false, columnDefinition = "text") private String document;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected HandoverDraftCopy() {}
    public HandoverDraftCopy(String id, String ownerEmail, int sourceAcademicYear, String document, Instant now) {
        this.id = id; this.ownerEmail = ownerEmail; this.sourceAcademicYear = sourceAcademicYear;
        this.document = document; this.createdAt = now; this.updatedAt = now;
    }
    public String getId() { return id; }
    public String getOwnerEmail() { return ownerEmail; }
    public int getSourceAcademicYear() { return sourceAcademicYear; }
    public String getDocument() { return document; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setDocument(String document) { this.document = document; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
