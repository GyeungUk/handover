package com.globalaffairs.handover.auth;

import org.springframework.stereotype.Service;

/** Decides an authenticated account's role, with the configured administrator list taking priority. */
@Service
public class AuthzService {

    private final AuthProperties properties;

    public AuthzService(AuthProperties properties) {
        this.properties = properties;
    }

    /** Every signed-in account is a member; a configured administrator number is an admin. */
    public AppRole roleFor(String employeeId) {
        if (employeeId == null || employeeId.isBlank()) {
            return null;
        }
        String normalized = employeeId.trim();
        if (properties.adminEmployeeIds().contains(normalized)) {
            return AppRole.ADMIN;
        }
        return AppRole.MEMBER;
    }
}
