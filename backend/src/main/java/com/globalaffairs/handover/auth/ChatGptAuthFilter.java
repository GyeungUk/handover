package com.globalaffairs.handover.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads the identity headers the ChatGPT authentication proxy adds, and attaches the resulting user
 * to the request. Port of {@code getChatGPTUser} in {@code app/chatgpt-auth.ts}.
 *
 * <p><strong>These headers are trusted.</strong> Anyone who can reach this service directly can set
 * them and become an administrator, exactly as in the Next.js build. The service must therefore only
 * ever be reachable through the authenticating proxy, which strips inbound copies of these headers
 * and sets its own. See {@code backend/docs/SECURITY.md}. As a second line of defence,
 * {@code handover.auth.gateway-secret} can require a shared secret header that only the proxy knows;
 * when it is set, requests without it are treated as unauthenticated.
 */
@Component
public class ChatGptAuthFilter extends OncePerRequestFilter {

    /** Request attribute holding the resolved {@link ChatGptUser}, or absent when unauthenticated. */
    public static final String USER_ATTRIBUTE = ChatGptAuthFilter.class.getName() + ".user";

    private static final String USER_ID_HEADER = "oai-authenticated-user-id";
    private static final String USER_EMAIL_HEADER = "oai-authenticated-user-email";
    private static final String USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
    private static final String USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
    private static final String PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

    private static final Logger log = LoggerFactory.getLogger(ChatGptAuthFilter.class);

    private final AuthzService authzService;
    private final GatewayProperties gatewayProperties;

    public ChatGptAuthFilter(AuthzService authzService, GatewayProperties gatewayProperties) {
        this.authzService = authzService;
        this.gatewayProperties = gatewayProperties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        resolveUser(request).ifPresentOrElse(
                user -> request.setAttribute(USER_ATTRIBUTE, user),
                () -> request.removeAttribute(USER_ATTRIBUTE));
        chain.doFilter(request, response);
    }

    private java.util.Optional<ChatGptUser> resolveUser(HttpServletRequest request) {
        if (!gatewaySecretMatches(request)) {
            log.debug("rejecting identity headers: gateway secret missing or wrong");
            return java.util.Optional.empty();
        }
        String userId = request.getHeader(USER_ID_HEADER);
        String email = request.getHeader(USER_EMAIL_HEADER);
        if (isBlank(userId) || isBlank(email)) {
            return java.util.Optional.empty();
        }
        String normalizedEmail = email.toLowerCase(Locale.ROOT);
        String fullName = decodeFullName(request);
        AppRole role = authzService.roleFor(normalizedEmail);
        return java.util.Optional.of(new ChatGptUser(
                userId,
                fullName != null ? fullName : normalizedEmail,
                normalizedEmail,
                fullName,
                role));
    }

    private boolean gatewaySecretMatches(HttpServletRequest request) {
        String expected = gatewayProperties.secret();
        if (expected == null || expected.isBlank()) {
            return true;
        }
        String presented = request.getHeader(gatewayProperties.secretHeader());
        return presented != null && java.security.MessageDigest.isEqual(
                presented.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }

    /** The proxy percent-encodes the name; a name sent any other way is dropped, as in the TS. */
    private static String decodeFullName(HttpServletRequest request) {
        String encoded = request.getHeader(USER_FULL_NAME_HEADER);
        if (isBlank(encoded) || !PERCENT_ENCODED_UTF8.equals(request.getHeader(USER_FULL_NAME_ENCODING_HEADER))) {
            return null;
        }
        try {
            return URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isEmpty();
    }
}
