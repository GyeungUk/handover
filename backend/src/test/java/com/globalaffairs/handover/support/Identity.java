package com.globalaffairs.handover.support;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Adds the identity headers the ChatGPT proxy would have set. */
public final class Identity {

    private Identity() {}

    public static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String email) {
        return request
                .header("oai-authenticated-user-id", "user-" + email)
                .header("oai-authenticated-user-email", email);
    }

    public static MockHttpServletRequestBuilder withFullName(MockHttpServletRequestBuilder request, String fullName) {
        return request
                .header("oai-authenticated-user-full-name", URLEncoder.encode(fullName, StandardCharsets.UTF_8))
                .header("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
    }
}
