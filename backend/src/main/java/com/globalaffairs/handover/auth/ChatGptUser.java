package com.globalaffairs.handover.auth;

/**
 * The signed-in user as the ChatGPT authentication proxy describes them.
 *
 * <p>Port of {@code ChatGPTUser} in {@code app/chatgpt-auth.ts}. {@code displayName} falls back to
 * the email when the proxy sent no decodable full name, because that is the name written into a
 * reschedule's {@code changedBy}.
 */
public record ChatGptUser(String userId, String displayName, String email, String fullName, AppRole role) {}
