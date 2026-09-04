package com.globalaffairs.handover.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One approved handover document, frozen as the record of the academic year it closed.
 *
 * <p>The live {@link HandoverDocument} is rewritten in place every year, so this is where a year
 * that has been approved goes before the next one starts on top of it. The document travels as the
 * serialised JSON the API already answers with — an archive is read whole and never queried into,
 * and freezing the shape is what keeps an old year readable after the live tables move on.
 */
@Entity
@Table(name = "handover_archives")
public class HandoverArchive {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_email", nullable = false)
    private String ownerEmail;

    @Column(name = "owner_name", nullable = false)
    private String ownerName;

    @Column(name = "academic_year", nullable = false)
    private int academicYear;

    @Column(nullable = false)
    private String status;

    /** The whole document as JSON; see {@link DocumentArchiveService} for the shape. */
    @Column(nullable = false)
    private String document;

    @Column(name = "entry_count", nullable = false)
    private int entryCount;

    @Column(name = "bundle_count", nullable = false)
    private int bundleCount;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private String reviewedBy;

    @Column(name = "archived_at", nullable = false)
    private Instant archivedAt;

    protected HandoverArchive() {
        // for JPA
    }

    public HandoverArchive(String ownerEmail, int academicYear) {
        this.ownerEmail = ownerEmail;
        this.academicYear = academicYear;
    }

    public Long getId() {
        return id;
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

    public int getAcademicYear() {
        return academicYear;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDocument() {
        return document;
    }

    public void setDocument(String document) {
        this.document = document;
    }

    public int getEntryCount() {
        return entryCount;
    }

    public void setEntryCount(int entryCount) {
        this.entryCount = entryCount;
    }

    public int getBundleCount() {
        return bundleCount;
    }

    public void setBundleCount(int bundleCount) {
        this.bundleCount = bundleCount;
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

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(Instant archivedAt) {
        this.archivedAt = archivedAt;
    }
}
