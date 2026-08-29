package com.globalaffairs.handover.support;

import com.globalaffairs.handover.auth.AuthProperties;
import com.globalaffairs.handover.auth.AuthzService;
import com.globalaffairs.handover.auth.ChatGptAuthFilter;
import com.globalaffairs.handover.auth.CurrentUserArgumentResolver;
import com.globalaffairs.handover.auth.GatewayProperties;
import com.globalaffairs.handover.config.CorsProperties;
import com.globalaffairs.handover.config.WebConfig;
import java.util.List;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/**
 * The authentication and CORS wiring a web slice needs, with the allow lists a test can rely on:
 * one admin, one member, and no gateway secret.
 */
@TestConfiguration
@Import({WebConfig.class, ChatGptAuthFilter.class, CurrentUserArgumentResolver.class, AuthzService.class})
public class WebSliceConfig {

    public static final String ADMIN_EMAIL = "admin@example.com";
    public static final String MEMBER_EMAIL = "member@example.com";
    public static final String OUTSIDER_EMAIL = "outsider@example.com";

    @Bean
    public AuthProperties authProperties() {
        return new AuthProperties(List.of(ADMIN_EMAIL), List.of(MEMBER_EMAIL));
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
