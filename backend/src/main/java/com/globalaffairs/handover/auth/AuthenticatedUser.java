package com.globalaffairs.handover.auth;

/**
 * The signed-in user, resolved from the session cookie the login endpoints hand out.
 *
 * <p>The account is identified by its employee number ({@code employeeId}) — that is what the person
 * types to sign in. The configured administrator list determines whether the account has admin
 * privileges. The
 * email is registration data rather than an identity: it is where a password reset is sent, and it
 * stays the key the saved handover documents are filed under, so the document layer is unchanged by
 * the move away from the ChatGPT proxy.
 *
 * @param employeeId digits only, unique per account
 * @param displayName the name the account registered, written into {@code changedBy} and {@code reviewedBy}
 * @param email the account's contact address, and the key its handover document is stored under
 * @param role member for every authenticated account, or admin for a configured administrator
 */
public record AuthenticatedUser(String employeeId, String displayName, String email, AppRole role) {}
