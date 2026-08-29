package com.globalaffairs.handover.auth;

import org.springframework.stereotype.Service;

/** Port of {@code getAppRole} in {@code app/authz.ts}, reading the allow lists from configuration. */
@Service
public class AuthzService {

    private final AuthProperties properties;

    public AuthzService(AuthProperties properties) {
        this.properties = properties;
    }

    /** The role for an email, or null when the account is not registered. Admin wins over member. */
    public AppRole roleFor(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        String normalized = email.trim().toLowerCase();
        if (properties.adminEmails().contains(normalized)) {
            return AppRole.ADMIN;
        }
        return properties.memberEmails().contains(normalized) ? AppRole.MEMBER : null;
    }
}
