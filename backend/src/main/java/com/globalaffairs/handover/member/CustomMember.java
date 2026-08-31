package com.globalaffairs.handover.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A person created by an administrator and attached to either a seed or custom part. */
@Entity
@Table(name = "custom_members")
public class CustomMember {

    @Id
    private String id;

    @Column(name = "team_id", nullable = false)
    private String teamId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String initial;

    /** The account that created this row during first-sign-in onboarding, when there is one. */
    @Column(name = "employee_id")
    private String employeeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CustomMember() {}

    public CustomMember(String id, String teamId, String name, String role, String initial, Instant createdAt) {
        this(id, teamId, name, role, initial, null, createdAt);
    }

    public CustomMember(
            String id, String teamId, String name, String role, String initial, String employeeId, Instant createdAt) {
        this.id = id;
        this.teamId = teamId;
        this.name = name;
        this.role = role;
        this.initial = initial;
        this.employeeId = employeeId;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getTeamId() { return teamId; }
    public String getName() { return name; }
    public String getRole() { return role; }
    public String getInitial() { return initial; }
    public String getEmployeeId() { return employeeId; }
    public Instant getCreatedAt() { return createdAt; }

    public void updateOnboarding(String teamId, String name, String role, String initial) {
        this.teamId = teamId;
        this.name = name;
        this.role = role;
        this.initial = initial;
    }
}
