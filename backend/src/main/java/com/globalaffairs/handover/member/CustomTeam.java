package com.globalaffairs.handover.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A part created by an administrator in addition to the exported seed org chart. */
@Entity
@Table(name = "custom_teams")
public class CustomTeam {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(name = "short_name", nullable = false)
    private String shortName;

    @Column(nullable = false)
    private String english;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private String color;

    @Column(nullable = false)
    private String soft;

    @Column(nullable = false)
    private String mark;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CustomTeam() {}

    public CustomTeam(
            String id,
            String title,
            String shortName,
            String english,
            String description,
            String color,
            String soft,
            String mark,
            Instant createdAt) {
        this.id = id;
        this.title = title;
        this.shortName = shortName;
        this.english = english;
        this.description = description;
        this.color = color;
        this.soft = soft;
        this.mark = mark;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getShortName() { return shortName; }
    public String getEnglish() { return english; }
    public String getDescription() { return description; }
    public String getColor() { return color; }
    public String getSoft() { return soft; }
    public String getMark() { return mark; }
    public Instant getCreatedAt() { return createdAt; }
}
