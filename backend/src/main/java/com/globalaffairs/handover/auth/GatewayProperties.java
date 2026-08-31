package com.globalaffairs.handover.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Optional shared secret proving a request really came through the authenticating proxy.
 *
 * <p>Leave {@code secret} empty and the API is usable by anything that can reach it; set it, and
 * configure the proxy to send the same value, and a caller who bypasses the proxy can neither use a
 * session nor reach the account endpoints — no registering, no password grinding straight at the
 * service.
 */
@ConfigurationProperties(prefix = "handover.auth.gateway")
public record GatewayProperties(String secret, String secretHeader) {

    public GatewayProperties {
        secretHeader = secretHeader == null || secretHeader.isBlank() ? "x-handover-gateway-secret" : secretHeader;
    }
}
