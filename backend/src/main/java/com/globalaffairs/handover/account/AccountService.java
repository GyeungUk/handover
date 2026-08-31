package com.globalaffairs.handover.account;

import com.globalaffairs.handover.auth.AccountIdentity;
import com.globalaffairs.handover.auth.AppRole;
import com.globalaffairs.handover.auth.AuthzService;
import com.globalaffairs.handover.web.ApiException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Everything behind the login screen: creating an account for an employee number, signing in and
 * out, and the emailed "비밀번호 찾기" round trip.
 *
 * <p>The login screen's first step — "is this number known?" — deliberately tells the caller which of the two
 * flows they are in, because the person needs to know whether they are creating a password or
 * recovering one; nothing further is revealed, which is why {@link #login} answers the same way for
 * an unknown number as for a wrong password.
 */
@Service
public class AccountService implements com.globalaffairs.handover.auth.SessionAuthenticator {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private static final int SESSION_TOKEN_BYTES = 32;
    private static final Duration RESET_REQUEST_WINDOW = Duration.ofHours(1);

    /** What the login screen needs after the first step: which flow the employee number leads to. */
    public enum Lookup {
        /** No account yet — the person sets a password now. */
        REGISTER,
        /** The number already has an account — the person recovers the password. */
        RESET
    }

    /** The result of a lookup: the flow, and — when recovering — where the code would be sent. */
    public record LookupResult(Lookup status, String maskedEmail) {}

    /** A freshly signed-in account and the session token the response should set as a cookie. */
    public record SignedIn(AccountIdentity account, AppRole role, String sessionToken) {}

    private final AccountRepository accounts;
    private final AccountSessionRepository sessions;
    private final PasswordResetTokenRepository resetTokens;
    private final AuthzService authz;
    private final PasswordHasher hasher;
    private final PasswordResetMailer mailer;
    private final LoginThrottle throttle;
    private final SessionProperties sessionProperties;
    private final PasswordResetProperties resetProperties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AccountService(
            AccountRepository accounts,
            AccountSessionRepository sessions,
            PasswordResetTokenRepository resetTokens,
            AuthzService authz,
            PasswordHasher hasher,
            PasswordResetMailer mailer,
            LoginThrottle throttle,
            SessionProperties sessionProperties,
            PasswordResetProperties resetProperties,
            Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.resetTokens = resetTokens;
        this.authz = authz;
        this.hasher = hasher;
        this.mailer = mailer;
        this.throttle = throttle;
        this.sessionProperties = sessionProperties;
        this.resetProperties = resetProperties;
        this.clock = clock;
    }

    /* ------------------------------------------------------------------ *
     * Session resolution — called by SessionAuthFilter on every request
     * ------------------------------------------------------------------ */

    @Override
    @Transactional(readOnly = true)
    public AccountIdentity authenticate(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return sessions.findById(PasswordHasher.tokenDigest(token))
                .filter(session -> session.getExpiresAt().isAfter(clock.instant()))
                .flatMap(session -> accounts.findById(session.getEmployeeId()))
                .map(AccountService::identityOf)
                .orElse(null);
    }

    /* ------------------------------------------------------------------ *
     * The login screen
     * ------------------------------------------------------------------ */

    /**
     * Step one of "비밀번호 찾기 및 만들기": the employee number decides which flow follows. An
     * any numeric employee number without an account proceeds to password creation.
     */
    @Transactional(readOnly = true)
    public LookupResult lookup(String rawEmployeeId) {
        String employeeId = Credentials.employeeId(rawEmployeeId);
        return accounts.findById(employeeId)
                .map(account -> new LookupResult(Lookup.RESET, Credentials.mask(account.getEmail())))
                .orElseGet(() -> new LookupResult(Lookup.REGISTER, null));
    }

    /** Creates the account and signs the person straight in — they just chose the password. */
    @Transactional
    public SignedIn register(String rawEmployeeId, String rawName, String rawEmail, String rawPassword) {
        String employeeId = Credentials.employeeId(rawEmployeeId);
        String name = Credentials.name(rawName);
        String email = Credentials.email(rawEmail);
        String password = Credentials.newPassword(rawPassword, employeeId);

        if (accounts.existsById(employeeId)) {
            throw ApiException.conflict("이미 비밀번호가 등록된 직번입니다. 비밀번호 찾기를 이용해 주세요.");
        }
        if (accounts.findByEmail(email).isPresent()) {
            throw ApiException.conflict("이미 사용 중인 이메일 주소입니다.");
        }

        Instant now = clock.instant();
        try {
            accounts.saveAndFlush(new Account(employeeId, name, email, hasher.hash(password), now));
        } catch (DataIntegrityViolationException raced) {
            // Two registrations for the same number or address at once; the loser is told the truth.
            throw ApiException.conflict("이미 등록된 직번 또는 이메일 주소입니다.");
        }
        throttle.clear(employeeId);
        log.info("account created for employee {}", employeeId);
        return signIn(employeeId, name, email);
    }

    /**
     * A wrong password and an unknown employee number answer identically. The lookup step already
     * told the person which of the two they are in, so this adds nothing for them — only for someone
     * probing numbers they do not own.
     */
    @Transactional
    public SignedIn login(String rawEmployeeId, String rawPassword) {
        String employeeId = Credentials.employeeId(rawEmployeeId);
        String password = rawPassword == null ? "" : rawPassword;

        if (throttle.isBlocked(employeeId)) {
            throw ApiException.tooManyRequests("비밀번호를 여러 번 잘못 입력했습니다. 잠시 후 다시 시도해 주세요.");
        }

        Optional<Account> found = accounts.findById(employeeId);
        if (found.isEmpty() || !hasher.matches(password, found.get().getPasswordHash())) {
            throttle.recordFailure(employeeId);
            throw ApiException.unauthorized("직번 또는 비밀번호가 올바르지 않습니다.");
        }
        Account account = found.get();

        if (hasher.needsRehash(account.getPasswordHash())) {
            account.setPasswordHash(hasher.hash(password), clock.instant());
        }

        throttle.clear(employeeId);
        return signIn(employeeId, account.getName(), account.getEmail());
    }

    /** Drops the one session the token belongs to; other browsers stay signed in. */
    @Transactional
    public void signOut(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        sessions.deleteById(PasswordHasher.tokenDigest(token));
    }

    /* ------------------------------------------------------------------ *
     * Password recovery
     * ------------------------------------------------------------------ */

    /**
     * Mails a fresh code to the address on the account, invalidating any code still outstanding.
     * Returns the masked address so the screen can say which inbox to open.
     */
    @Transactional
    public String requestPasswordReset(String rawEmployeeId) {
        String employeeId = Credentials.employeeId(rawEmployeeId);
        Account account = accounts.findById(employeeId).orElseThrow(() ->
                ApiException.notFound("아직 비밀번호가 등록되지 않은 직번입니다. 비밀번호 만들기를 먼저 진행해 주세요."));

        Instant now = clock.instant();
        if (resetTokens.countRecent(employeeId, now.minus(RESET_REQUEST_WINDOW)) >= resetProperties.maxPerHour()) {
            throw ApiException.tooManyRequests("인증번호를 너무 자주 요청했습니다. 잠시 후 다시 시도해 주세요.");
        }

        String code = numericCode();
        resetTokens.deleteAll(resetTokens.findByEmployeeIdAndUsedAtIsNull(employeeId));
        resetTokens.saveAndFlush(new PasswordResetToken(
                resetDigest(employeeId, code), employeeId, now, now.plus(resetProperties.ttl())));

        // Sending last: a mail that fails must not leave a code the person never received.
        mailer.send(employeeId, account.getEmail(), code);
        return Credentials.mask(account.getEmail());
    }

    /**
     * Accepts the emailed code, sets the new password, and signs the person in on this browser.
     *
     * <p>{@code noRollbackFor} is what makes the attempt counter mean anything: a wrong code answers
     * with an {@link ApiException}, and the default rollback would take the increment with it,
     * handing a guesser unlimited free tries.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public SignedIn confirmPasswordReset(String rawEmployeeId, String rawCode, String rawPassword) {
        String employeeId = Credentials.employeeId(rawEmployeeId);
        Account account = accounts.findById(employeeId).orElseThrow(() ->
                ApiException.notFound("아직 비밀번호가 등록되지 않은 직번입니다."));
        String password = Credentials.newPassword(rawPassword, employeeId);
        String code = rawCode == null ? "" : rawCode.trim();

        Instant now = clock.instant();
        PasswordResetToken token = resetTokens
                .findByTokenHashAndEmployeeId(resetDigest(employeeId, code), employeeId)
                .orElseThrow(() -> wrongCode(employeeId, now));
        if (token.getUsedAt() != null || token.getExpiresAt().isBefore(now)) {
            throw ApiException.badRequest("인증번호가 만료되었습니다. 다시 요청해 주세요.");
        }
        if (token.getAttempts() >= resetProperties.maxAttempts()) {
            throw ApiException.tooManyRequests("인증번호를 너무 여러 번 잘못 입력했습니다. 다시 요청해 주세요.");
        }

        token.markUsed(now);
        account.setPasswordHash(hasher.hash(password), now);
        // A recovered password means the old one may be in someone else's hands: end every session.
        sessions.deleteByEmployeeId(employeeId);
        throttle.clear(employeeId);
        log.info("password reset completed for employee {}", employeeId);
        return signIn(employeeId, account.getName(), account.getEmail());
    }

    /**
     * A wrong code still costs an attempt on whatever code is outstanding, so guessing burns the
     * code rather than getting free tries at it.
     */
    private ApiException wrongCode(String employeeId, Instant now) {
        List<PasswordResetToken> outstanding = resetTokens.findByEmployeeIdAndUsedAtIsNull(employeeId);
        outstanding.forEach(PasswordResetToken::recordAttempt);
        boolean exhausted = outstanding.stream()
                .anyMatch(token -> token.getAttempts() >= resetProperties.maxAttempts()
                        && token.getExpiresAt().isAfter(now));
        return exhausted
                ? ApiException.tooManyRequests("인증번호를 너무 여러 번 잘못 입력했습니다. 다시 요청해 주세요.")
                : ApiException.badRequest("인증번호가 올바르지 않습니다.");
    }

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    private SignedIn signIn(String employeeId, String name, String email) {
        Instant now = clock.instant();
        sessions.deleteExpired(now);
        String token = randomToken();
        sessions.save(new AccountSession(
                PasswordHasher.tokenDigest(token), employeeId, now, now.plus(sessionProperties.ttl())));
        return new SignedIn(new AccountIdentity(employeeId, name, email), authz.roleFor(employeeId), token);
    }

    private String randomToken() {
        byte[] value = new byte[SESSION_TOKEN_BYTES];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    /** Six digits, zero padded — short enough to retype from a phone, guarded by the attempt count. */
    private String numericCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    /** Scoped to the account, so a code is only ever valid for the number it was issued for. */
    private static String resetDigest(String employeeId, String code) {
        return PasswordHasher.tokenDigest(employeeId + ":" + code);
    }

    private static AccountIdentity identityOf(Account account) {
        return new AccountIdentity(account.getEmployeeId(), account.getName(), account.getEmail());
    }
}
