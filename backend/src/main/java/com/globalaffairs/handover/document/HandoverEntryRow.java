package com.globalaffairs.handover.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One handover entry as it is stored.
 *
 * <p>{@code properties} and {@code attachments} are JSON text: they are read and written with the
 * whole document and never queried into, so they stay in the shape the API already speaks.
 * {@code position} is what preserves the author's ordering across a rewrite.
 */
@Entity
@Table(name = "handover_entries")
public class HandoverEntryRow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_email", nullable = false)
    private String ownerEmail;

    @Column(name = "entry_id", nullable = false)
    private String entryId;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String detail;

    @Column(nullable = false)
    private String properties;

    @Column(nullable = false)
    private String attachments;

    @Column(name = "font_family", nullable = false)
    private String fontFamily;

    @Column(name = "font_size", nullable = false)
    private String fontSize;

    protected HandoverEntryRow() {
        // for JPA
    }

    public HandoverEntryRow(
            String ownerEmail,
            String entryId,
            int position,
            String category,
            String title,
            String detail,
            String properties,
            String attachments,
            String fontFamily,
            String fontSize) {
        this.ownerEmail = ownerEmail;
        this.entryId = entryId;
        this.position = position;
        this.category = category;
        this.title = title;
        this.detail = detail;
        this.properties = properties;
        this.attachments = attachments;
        this.fontFamily = fontFamily;
        this.fontSize = fontSize;
    }

    public Long getId() {
        return id;
    }

    public String getOwnerEmail() {
        return ownerEmail;
    }

    public String getEntryId() {
        return entryId;
    }

    public int getPosition() {
        return position;
    }

    public String getCategory() {
        return category;
    }

    public String getTitle() {
        return title;
    }

    public String getDetail() {
        return detail;
    }

    public String getProperties() {
        return properties;
    }

    public String getAttachments() {
        return attachments;
    }

    public String getFontFamily() {
        return fontFamily;
    }

    public String getFontSize() {
        return fontSize;
    }
}
