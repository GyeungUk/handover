package com.globalaffairs.handover.account;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The envelope on the password-reset mail. The server itself is configured under {@code spring.mail};
 * when no host is set there, Boot creates no {@code JavaMailSender} and
 * {@link PasswordResetMailer} says so rather than dropping the message.
 *
 * @param from the address the mail is sent from, e.g. {@code no-reply@example.ac.kr}
 * @param fromName the display name shown beside it
 */
@ConfigurationProperties(prefix = "handover.mail")
public record MailProperties(String from, String fromName) {

    public MailProperties {
        fromName = fromName == null || fromName.isBlank() ? "국제처 업무 인수인계" : fromName.trim();
    }

    public boolean configured() {
        return from != null && !from.isBlank();
    }
}
