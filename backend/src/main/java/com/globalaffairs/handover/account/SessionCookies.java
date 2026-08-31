package com.globalaffairs.handover.account;

import com.globalaffairs.handover.auth.SessionAuthFilter;
import java.time.Duration;
import org.springframework.http.ResponseCookie;

/** Builds the two cookies the auth endpoints ever set: the session, and its removal. */
final class SessionCookies {

    private SessionCookies() {}

    static ResponseCookie issue(String token, SessionProperties properties) {
        return base(properties).value(token).maxAge(properties.ttl()).build();
    }

    static ResponseCookie clear(SessionProperties properties) {
        return base(properties).value("").maxAge(Duration.ZERO).build();
    }

    private static ResponseCookie.ResponseCookieBuilder base(SessionProperties properties) {
        return ResponseCookie.from(SessionAuthFilter.SESSION_COOKIE)
                // Never readable from JavaScript, and scoped to the whole app so every /api call carries it.
                .httpOnly(true)
                .path("/")
                .secure(properties.secure())
                .sameSite(properties.sameSite());
    }
}
