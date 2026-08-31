package com.globalaffairs.handover.support;

import com.globalaffairs.handover.auth.AccountIdentity;
import com.globalaffairs.handover.auth.AuthProperties;
import com.globalaffairs.handover.auth.AuthzService;
import com.globalaffairs.handover.auth.CurrentUserArgumentResolver;
import com.globalaffairs.handover.auth.GatewayProperties;
import com.globalaffairs.handover.auth.SessionAuthFilter;
import com.globalaffairs.handover.account.SessionProperties;
import com.globalaffairs.handover.auth.SessionAuthenticator;
import com.globalaffairs.handover.config.CorsProperties;
import com.globalaffairs.handover.config.WebConfig;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

/**
 * The authentication and CORS wiring a web slice needs, with a fixed cast of accounts: one
 * administrator, two members, and a member whose account has no name. No database is involved — sessions are resolved from the map
 * below, which is the whole point of {@link SessionAuthenticator} being an interface.
 */
@TestConfiguration
@Import({WebConfig.class, SessionAuthFilter.class, CurrentUserArgumentResolver.class, AuthzService.class})
public class WebSliceConfig {

    public static final String SESSION_COOKIE = SessionAuthFilter.SESSION_COOKIE;

    public static final String ADMIN_ID = "20180001";
    public static final String MEMBER_ID = "20190002";
    /** Registered, but the account carries no name — the display name falls back to the email. */
    public static final String NAMELESS_ID = "20190003";
    public static final String OUTSIDER_ID = "20200004";

    public static final String ADMIN_EMAIL = "admin@example.com";
    public static final String MEMBER_EMAIL = "member@example.com";
    public static final String NAMELESS_EMAIL = "nameless@example.com";
    public static final String OUTSIDER_EMAIL = "outsider@example.com";

    public static final String ADMIN_NAME = "김파트장";
    public static final String MEMBER_NAME = "박민서";

    private static final Map<String, AccountIdentity> ACCOUNTS = Map.of(
            ADMIN_ID, new AccountIdentity(ADMIN_ID, ADMIN_NAME, ADMIN_EMAIL),
            MEMBER_ID, new AccountIdentity(MEMBER_ID, MEMBER_NAME, MEMBER_EMAIL),
            NAMELESS_ID, new AccountIdentity(NAMELESS_ID, "", NAMELESS_EMAIL),
            OUTSIDER_ID, new AccountIdentity(OUTSIDER_ID, "밖사람", OUTSIDER_EMAIL));

    public static String sessionTokenFor(String employeeId) {
        return "session-" + employeeId;
    }

    /** Primary because a mocked {@code AccountService} in a slice is also a {@link SessionAuthenticator}. */
    @Bean
    @Primary
    public SessionAuthenticator sessionAuthenticator() {
        return token -> token != null && token.startsWith("session-")
                ? ACCOUNTS.get(token.substring("session-".length()))
                : null;
    }

    @Bean
    public AuthProperties authProperties() {
        return new AuthProperties(List.of(ADMIN_ID), List.of(MEMBER_ID, NAMELESS_ID));
    }

    @Bean
    public SessionProperties sessionProperties() {
        return new SessionProperties(Duration.ofDays(14), false, "Lax");
    }

    @Bean
    public GatewayProperties gatewayProperties() {
        return new GatewayProperties("", null);
    }

    @Bean
    public CorsProperties corsProperties() {
        return new CorsProperties(List.of("http://localhost:3000"), true);
    }
}
