package com.globalaffairs.handover.auth;

/**
 * Turns a session cookie value into the account that owns it.
 *
 * <p>An interface rather than a direct call into the account package so {@link SessionAuthFilter}
 * carries no persistence dependency: the web slices in the test suite supply a fixed set of sessions
 * instead of a database.
 */
public interface SessionAuthenticator {

    /** The account the token belongs to, or null when the token is unknown, expired or revoked. */
    AccountIdentity authenticate(String token);
}
