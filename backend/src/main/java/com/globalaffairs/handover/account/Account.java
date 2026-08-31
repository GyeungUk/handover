package com.globalaffairs.handover.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A workspace account, keyed by the employee number the person signs in with.
 *
 * <p>The email is not an identity here — it is where a password reset is sent, and it stays the key
 * the handover document and the review workflow are filed under, so nothing downstream of
 * authentication had to change when logins moved from the ChatGPT proxy to this table.
 */
@Entity
@Table(name = "accounts")
public class Account {

    @Id
    @Column(name = "employee_id", nullable = false)
    private String employeeId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Account() {
        // for JPA
    }

    public Account(String employeeId, String name, String email, String passwordHash, Instant createdAt) {
        this.employeeId = employeeId;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setPasswordHash(String passwordHash, Instant changedAt) {
        this.passwordHash = passwordHash;
        this.updatedAt = changedAt;
    }
}
