package com.globalaffairs.handover.auth;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Who may use the workspace, and who administers it.
 *
 * <p>The Next.js build hardcoded these addresses in {@code app/authz.ts}; here they come from
 * configuration so an account can be added without a redeploy of application code. Emails are
 * compared lowercase.
 *
 * @param adminEmails accounts that may remove and restore members
 * @param memberEmails accounts that may read the workspace and record reschedules
 */
@ConfigurationProperties(prefix = "handover.auth")
public record AuthProperties(List<String> adminEmails, List<String> memberEmails) {

    public AuthProperties {
        adminEmails = normalize(adminEmails);
        memberEmails = normalize(memberEmails);
    }

    private static List<String> normalize(List<String> emails) {
        return emails == null
                ? List.of()
                : emails.stream()
                        .filter(email -> email != null && !email.isBlank())
                        .map(email -> email.trim().toLowerCase())
                        .distinct()
                        .toList();
    }
}
