package com.globalaffairs.handover.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Browser origins allowed to call this API.
 *
 * <p>Under Cloudflare the frontend and the API shared an origin, so no CORS was involved. Running
 * Spring on its own port makes the calls cross-origin, so the Next.js dev origin has to be listed
 * explicitly. Credentials are allowed because the proxy's session cookie rides along.
 *
 * @param allowedOrigins exact origins, e.g. {@code http://localhost:3000}
 * @param allowCredentials whether cookies may be sent; must be false if origins contain {@code *}
 */
@ConfigurationProperties(prefix = "handover.cors")
public record CorsProperties(List<String> allowedOrigins, boolean allowCredentials) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null
                ? List.of()
                : allowedOrigins.stream()
                        .filter(origin -> origin != null && !origin.isBlank())
                        .map(String::trim)
                        .distinct()
                        .toList();
    }
}
