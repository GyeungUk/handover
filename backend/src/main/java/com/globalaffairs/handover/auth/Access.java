package com.globalaffairs.handover.auth;

import com.globalaffairs.handover.web.ApiException;

/**
 * The two access checks the original routes made, kept in one place so every endpoint answers with
 * the same status and the same Korean message it did under Next.js.
 */
public final class Access {

    private Access() {}

    /**
     * Any signed-in account.
     */
    public static AuthenticatedUser requireRegistered(AuthenticatedUser user) {
        if (user == null) {
            throw ApiException.unauthorized("로그인이 필요합니다.");
        }
        return user;
    }

    /**
     * Administrators only. Anyone else — including an unauthenticated caller — gets 403, matching
     * {@code if (await authorizedRole() !== 'admin')} in {@code app/api/members/route.ts}.
     */
    public static AuthenticatedUser requireAdmin(AuthenticatedUser user) {
        if (user == null || user.role() != AppRole.ADMIN) {
            throw ApiException.forbidden("관리자 권한이 필요합니다.");
        }
        return user;
    }
}
