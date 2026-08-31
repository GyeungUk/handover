package com.globalaffairs.handover.account;

import com.globalaffairs.handover.account.AccountService.LookupResult;
import com.globalaffairs.handover.account.AccountService.SignedIn;
import com.globalaffairs.handover.account.AuthRequests.DeleteAccountRequest;
import com.globalaffairs.handover.account.AuthRequests.EmployeeIdRequest;
import com.globalaffairs.handover.account.AuthRequests.LoginRequest;
import com.globalaffairs.handover.account.AuthRequests.RegisterRequest;
import com.globalaffairs.handover.account.AuthRequests.ResetRequest;
import com.globalaffairs.handover.auth.AppRole;
import com.globalaffairs.handover.auth.Access;
import com.globalaffairs.handover.auth.AuthenticatedUser;
import com.globalaffairs.handover.auth.SessionAuthFilter;
import com.globalaffairs.handover.web.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/auth} — the login screen's whole conversation with the server.
 *
 * <p>The screen is one field deep on purpose. A person types their employee number; {@code /lookup}
 * says whether that number already has a password, and the screen either takes them to "비밀번호
 * 만들기" or to "비밀번호 찾기". Everything else here is one of those two paths ending in a session.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AccountService accounts;
    private final SessionProperties sessionProperties;

    public AuthController(AccountService accounts, SessionProperties sessionProperties) {
        this.accounts = accounts;
        this.sessionProperties = sessionProperties;
    }

    /** The signed-in user as every screen reads it. Null-free: absence is {@code user: null} above. */
    public record UserResponse(String employeeId, String displayName, String email, String role) {}

    /** What {@code GET /api/auth/session} answers with — {@code user} is null when signed out. */
    public record SessionResponse(UserResponse user) {}

    /**
     * The answer to step one. {@code status} is {@code "register"} or {@code "reset"};
     * {@code maskedEmail} is filled in only for {@code "reset"}, so the screen can name the inbox.
     */
    public record LookupResponse(String status, String maskedEmail) {}

    /**
     * Who the browser currently is. The frontend renders the login screen or the workspace from this
     * one call, so a missing or expired session is a 200 with {@code user: null}, not a 401.
     */
    @GetMapping("/session")
    public ResponseEntity<SessionResponse> session(AuthenticatedUser user) {
        return ResponseEntity.ok(new SessionResponse(user == null || user.role() == null ? null : toResponse(user)));
    }

    /** Step one: does this employee number already have a password? */
    @PostMapping("/lookup")
    public ResponseEntity<LookupResponse> lookup(
            HttpServletRequest request, @RequestBody(required = false) EmployeeIdRequest body) {
        requireGateway(request);
        LookupResult result = accounts.lookup(body == null ? null : body.employeeId());
        return ResponseEntity.ok(
                new LookupResponse(result.status().name().toLowerCase(Locale.ROOT), result.maskedEmail()));
    }

    /** First-time password creation for any numeric employee number. */
    @PostMapping("/register")
    public ResponseEntity<SessionResponse> register(
            HttpServletRequest request, @RequestBody(required = false) RegisterRequest body) {
        requireGateway(request);
        RegisterRequest form = body == null ? new RegisterRequest(null, null, null, null) : body;
        return signedIn(accounts.register(form.employeeId(), form.name(), form.email(), form.password()));
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(
            HttpServletRequest request, @RequestBody(required = false) LoginRequest body) {
        requireGateway(request);
        LoginRequest form = body == null ? new LoginRequest(null, null) : body;
        return signedIn(accounts.login(form.employeeId(), form.password()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Boolean>> logout(
            @CookieValue(name = SessionAuthFilter.SESSION_COOKIE, required = false) String token) {
        accounts.signOut(token);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, SessionCookies.clear(sessionProperties).toString())
                .body(Map.of("ok", true));
    }

    /** Deletes the current account and expires this browser's now-invalid session cookie. */
    @DeleteMapping("/account")
    public ResponseEntity<Map<String, Boolean>> deleteAccount(
            AuthenticatedUser user, @RequestBody(required = false) DeleteAccountRequest body) {
        AuthenticatedUser account = Access.requireRegistered(user);
        accounts.deleteAccount(account.employeeId(), body == null ? null : body.password());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, SessionCookies.clear(sessionProperties).toString())
                .body(Map.of("ok", true));
    }

    /** Mails a code to the address on the account. The masked address goes back to the screen. */
    @PostMapping("/password/reset-request")
    public ResponseEntity<Map<String, String>> requestReset(
            HttpServletRequest request, @RequestBody(required = false) EmployeeIdRequest body) {
        requireGateway(request);
        String maskedEmail = accounts.requestPasswordReset(body == null ? null : body.employeeId());
        return ResponseEntity.ok(Map.of("maskedEmail", maskedEmail));
    }

    /** Finishes the reset and signs the person in, so they are not asked to type the new one twice. */
    @PostMapping("/password/reset")
    public ResponseEntity<SessionResponse> confirmReset(
            HttpServletRequest request, @RequestBody(required = false) ResetRequest body) {
        requireGateway(request);
        ResetRequest form = body == null ? new ResetRequest(null, null, null) : body;
        return signedIn(accounts.confirmPasswordReset(form.employeeId(), form.code(), form.password()));
    }

    private ResponseEntity<SessionResponse> signedIn(SignedIn signedIn) {
        ResponseCookie cookie = SessionCookies.issue(signedIn.sessionToken(), sessionProperties);
        UserResponse user = new UserResponse(
                signedIn.account().employeeId(),
                signedIn.account().name(),
                signedIn.account().email(),
                roleName(signedIn.role()));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new SessionResponse(user));
    }

    /**
     * When a gateway secret is configured, these endpoints are only reachable through the proxy —
     * otherwise a service exposed by accident would let a stranger register accounts and grind
     * passwords, which no amount of session security would help with.
     */
    private static void requireGateway(HttpServletRequest request) {
        if (!Boolean.TRUE.equals(request.getAttribute(SessionAuthFilter.GATEWAY_TRUSTED_ATTRIBUTE))) {
            throw ApiException.forbidden("허용되지 않은 요청입니다.");
        }
    }

    private static UserResponse toResponse(AuthenticatedUser user) {
        return new UserResponse(user.employeeId(), user.displayName(), user.email(), roleName(user.role()));
    }

    private static String roleName(AppRole role) {
        return role == AppRole.ADMIN ? "admin" : "member";
    }
}
