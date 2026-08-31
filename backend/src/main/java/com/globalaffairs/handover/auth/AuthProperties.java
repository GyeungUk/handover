package com.globalaffairs.handover.auth;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Which employee numbers may use the workspace, and which of them administer it.
 *
 * <p>An account is created by the person themselves — they type their employee number, set a
 * password, and are in. Any numeric employee number may create an account. The administrator list
 * controls elevated privileges; the member list remains accepted for configuration compatibility.
 *
 * <p>They live in the environment rather than in code, so adding a colleague is a configuration
 * change and no personal detail ends up in the repository.
 *
 * @param adminEmployeeIds accounts that may remove and restore members, and review submissions
 * @param memberEmployeeIds accounts that may read the workspace and write their own handover
 */
@ConfigurationProperties(prefix = "handover.auth")
public record AuthProperties(List<String> adminEmployeeIds, List<String> memberEmployeeIds) {

    public AuthProperties {
        adminEmployeeIds = normalize(adminEmployeeIds);
        memberEmployeeIds = normalize(memberEmployeeIds);
    }

    private static List<String> normalize(List<String> employeeIds) {
        return employeeIds == null
                ? List.of()
                : employeeIds.stream()
                        .filter(id -> id != null && !id.isBlank())
                        .map(String::trim)
                        .distinct()
                        .toList();
    }
}
