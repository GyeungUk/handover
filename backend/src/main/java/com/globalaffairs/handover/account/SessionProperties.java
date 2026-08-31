package com.globalaffairs.handover.account;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How the session cookie behaves.
 *
 * @param ttl how long a sign-in lasts before the person has to type their password again
 * @param secure send the cookie only over HTTPS; must be false for plain-http local development
 * @param sameSite {@code Lax} is right for a same-origin app; a cross-site frontend needs {@code None}
 */
@ConfigurationProperties(prefix = "handover.auth.session")
public record SessionProperties(Duration ttl, boolean secure, String sameSite) {

    public SessionProperties {
        ttl = ttl == null || ttl.isZero() || ttl.isNegative() ? Duration.ofDays(14) : ttl;
        sameSite = sameSite == null || sameSite.isBlank() ? "Lax" : sameSite.trim();
    }
}
