package com.globalaffairs.handover.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Optional shared secret proving a request really came through the authenticating proxy.
 *
 * <p>Leave {@code secret} empty to keep the Next.js behaviour of trusting the identity headers on
 * their own; set it, and configure the proxy to send the same value, to make forged identity headers
 * useless to anyone who reaches the service directly.
 */
@ConfigurationProperties(prefix = "handover.auth.gateway")
public record GatewayProperties(String secret, String secretHeader) {

    public GatewayProperties {
        secretHeader = secretHeader == null || secretHeader.isBlank() ? "x-handover-gateway-secret" : secretHeader;
    }
}
