package com.globalaffairs.handover.account;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The "비밀번호 찾기" code: how long it lives, and how hard it is to grind.
 *
 * @param ttl validity window; short, because the code is only six digits
 * @param maxAttempts wrong entries a single code tolerates before it is burned
 * @param maxPerHour codes one account may request per hour, so the endpoint cannot be used to spam an inbox
 * @param logCode write the code to the log instead of relying on mail reaching a real inbox — local
 *     development only, and refused outright when a mail server is configured
 */
@ConfigurationProperties(prefix = "handover.auth.password-reset")
public record PasswordResetProperties(Duration ttl, int maxAttempts, int maxPerHour, boolean logCode) {

    public PasswordResetProperties {
        ttl = ttl == null || ttl.isZero() || ttl.isNegative() ? Duration.ofMinutes(10) : ttl;
        maxAttempts = maxAttempts <= 0 ? 5 : maxAttempts;
        maxPerHour = maxPerHour <= 0 ? 5 : maxPerHour;
    }
}
