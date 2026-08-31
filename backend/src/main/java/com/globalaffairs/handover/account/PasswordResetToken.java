package com.globalaffairs.handover.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A pending "비밀번호 찾기" — the digest of the code that was emailed, and what it is still good for.
 *
 * <p>The code is short enough to retype, so the row carries an attempt counter: without one, six
 * digits are guessable inside the validity window. It is consumed on use ({@code usedAt}), never
 * reused, and a fresh request invalidates whatever was outstanding.
 */
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id
    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "employee_id", nullable = false)
    private String employeeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(nullable = false)
    private int attempts;

    protected PasswordResetToken() {
        // for JPA
    }

    public PasswordResetToken(String tokenHash, String employeeId, Instant createdAt, Instant expiresAt) {
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

    public Instant getUsedAt() {
        return usedAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public void recordAttempt() {
        attempts += 1;
    }

    public void markUsed(Instant when) {
        usedAt = when;
    }
}
