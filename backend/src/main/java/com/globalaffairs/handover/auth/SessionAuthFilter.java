package com.globalaffairs.handover.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Resolves the caller from the session cookie {@code /api/auth/login} issues, and attaches the
 * resulting user to the request.
 *
 * <p>This replaces the filter that trusted {@code oai-authenticated-user-*} headers from the ChatGPT
 * proxy. A session token is unforgeable on its own — it is a random 256-bit value the server stored
 * a hash of — so identity no longer depends on the deployment stripping inbound headers.
 *
 * <p>{@code handover.auth.gateway.secret} remains as a second line of defence, and now covers more
 * than it did: when it is set, a request that does not carry it is treated as unauthenticated
 * <em>and</em> is refused by the account endpoints, so the service being reachable directly does not
 * let a stranger register accounts or grind passwords. See {@code backend/docs/SECURITY.md}.
 */
@Component
public class SessionAuthFilter extends OncePerRequestFilter {

    /** Request attribute holding the resolved {@link AuthenticatedUser}, or absent when unauthenticated. */
    public static final String USER_ATTRIBUTE = SessionAuthFilter.class.getName() + ".user";

    /**
     * Request attribute set when the request either came through the gateway or no gateway secret is
     * configured. The account endpoints read it; everything else reads {@link #USER_ATTRIBUTE}, which
     * is only ever populated on a trusted request anyway.
     */
    public static final String GATEWAY_TRUSTED_ATTRIBUTE = SessionAuthFilter.class.getName() + ".gatewayTrusted";

    /** The cookie name is part of the contract with the frontend; see {@code app/session.ts}. */
    public static final String SESSION_COOKIE = "handover_session";

    private final SessionAuthenticator authenticator;
    private final AuthzService authzService;
    private final GatewayProperties gatewayProperties;

    public SessionAuthFilter(
            SessionAuthenticator authenticator, AuthzService authzService, GatewayProperties gatewayProperties) {
        this.authenticator = authenticator;
        this.authzService = authzService;
        this.gatewayProperties = gatewayProperties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean trusted = gatewaySecretMatches(request);
        request.setAttribute(GATEWAY_TRUSTED_ATTRIBUTE, trusted);
        resolveUser(request, trusted).ifPresentOrElse(
                user -> request.setAttribute(USER_ATTRIBUTE, user),
                () -> request.removeAttribute(USER_ATTRIBUTE));
        chain.doFilter(request, response);
    }

    private Optional<AuthenticatedUser> resolveUser(HttpServletRequest request, boolean trusted) {
        if (!trusted) {
            logger.debug("rejecting session cookie: gateway secret missing or wrong");
            return Optional.empty();
        }
        String token = sessionToken(request);
        if (token == null) {
            return Optional.empty();
        }
        AccountIdentity account = authenticator.authenticate(token);
        if (account == null) {
            return Optional.empty();
        }
        AppRole role = authzService.roleFor(account.employeeId());
        String displayName = account.name() == null || account.name().isBlank() ? account.email() : account.name();
        return Optional.of(new AuthenticatedUser(account.employeeId(), displayName, account.email(), role));
    }

    private static String sessionToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (SESSION_COOKIE.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private boolean gatewaySecretMatches(HttpServletRequest request) {
        String expected = gatewayProperties.secret();
        if (expected == null || expected.isBlank()) {
            return true;
        }
        String presented = request.getHeader(gatewayProperties.secretHeader());
        return presented != null && MessageDigest.isEqual(
                presented.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }
}
