package com.globalaffairs.handover.support;

import jakarta.servlet.http.Cookie;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Signs a request in as one of {@link WebSliceConfig}'s accounts, by attaching the session cookie
 * the login endpoints would have set. The fake authenticator in {@code WebSliceConfig} is what turns
 * the token back into an account.
 */
public final class Identity {

    private Identity() {}

    public static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String employeeId) {
        return request.cookie(new Cookie(WebSliceConfig.SESSION_COOKIE, WebSliceConfig.sessionTokenFor(employeeId)));
    }
}
