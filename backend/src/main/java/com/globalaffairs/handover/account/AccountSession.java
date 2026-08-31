package com.globalaffairs.handover.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One signed-in browser.
 *
 * <p>Only a SHA-256 digest of the token is stored: the token itself lives in the cookie and nowhere
 * else, so reading this table gets an attacker no sessions. Sessions are rows rather than signed
 * cookies so that signing out, and changing a password, can actually revoke them.
 */
@Entity
@Table(name = "account_sessions")
public class AccountSession {

    @Id
    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "employee_id", nullable = false)
    private String employeeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected AccountSession() {
        // for JPA
    }

    public AccountSession(String tokenHash, String employeeId, Instant createdAt, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.employeeId = employeeId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
