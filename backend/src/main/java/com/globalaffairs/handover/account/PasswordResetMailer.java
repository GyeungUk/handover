package com.globalaffairs.handover.account;

import com.globalaffairs.handover.web.ApiException;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends the "비밀번호 찾기" code to the address the account registered.
 *
 * <p>Mail is optional configuration, so the sender is looked up lazily: with no {@code spring.mail.host}
 * Boot creates no {@link JavaMailSender} at all. Rather than accept the request and silently drop
 * it, an unconfigured deployment answers 503 — the same way the AI endpoints answer without an
 * OpenAI key. {@code handover.auth.password-reset.log-code} is the deliberate local-development
 * escape hatch, and it refuses to co-exist with a real mail server so it cannot be left on by
 * accident in production.
 */
@Component
public class PasswordResetMailer {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetMailer.class);

    private final ObjectProvider<JavaMailSender> senders;
    private final MailProperties mailProperties;
    private final PasswordResetProperties resetProperties;

    public PasswordResetMailer(
            ObjectProvider<JavaMailSender> senders,
            MailProperties mailProperties,
            PasswordResetProperties resetProperties) {
        this.senders = senders;
        this.mailProperties = mailProperties;
        this.resetProperties = resetProperties;
    }

    public void send(String employeeId, String email, String code) {
        JavaMailSender sender = senders.getIfAvailable();

        if (resetProperties.logCode()) {
            if (sender != null && mailProperties.configured()) {
                throw new IllegalStateException(
                        "handover.auth.password-reset.log-code is on while a mail server is configured; "
                                + "turn it off so reset codes are not written to the log");
            }
            log.warn("password reset code for {} ({}): {} — log-code is on, no mail was sent", employeeId, email, code);
            return;
        }

        if (sender == null || !mailProperties.configured()) {
            log.error("password reset requested for {} but no mail server is configured", employeeId);
            throw ApiException.unavailable("비밀번호 재설정 메일을 보낼 수 없습니다. 관리자에게 문의해 주세요.");
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailProperties.fromName() + " <" + mailProperties.from() + ">");
        message.setTo(email);
        message.setSubject("[국제처 업무 인수인계] 비밀번호 재설정 인증번호");
        message.setText(body(employeeId, code, resetProperties.ttl()));
        try {
            sender.send(message);
        } catch (MailException failure) {
            log.error("could not send the password reset mail for {}", employeeId, failure);
            throw ApiException.badGateway("비밀번호 재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    private static String body(String employeeId, String code, Duration ttl) {
        return """
                비밀번호 재설정 인증번호입니다.

                직번: %s
                인증번호: %s

                이 번호는 %d분 동안만 사용할 수 있습니다.
                본인이 요청하지 않았다면 이 메일을 무시하고, 국제처에 알려 주세요.
                """.formatted(employeeId, code, ttl.toMinutes());
    }
}
