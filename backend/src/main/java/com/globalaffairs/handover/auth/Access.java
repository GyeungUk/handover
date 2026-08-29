package com.globalaffairs.handover.auth;

import com.globalaffairs.handover.web.ApiException;

/**
 * The two access checks the original routes made, kept in one place so every endpoint answers with
 * the same status and the same Korean message it did under Next.js.
 */
public final class Access {

    private Access() {}

    /**
     * Any registered account. An unknown or unregistered caller gets 401, matching
     * {@code if (!user || !getAppRole(user))} in the Next.js routes — note that a signed-in but
     * unregistered email is 401 there too, not 403.
     */
    public static ChatGptUser requireRegistered(ChatGptUser user) {
        if (user == null || user.role() == null) {
            throw ApiException.unauthorized("로그인이 필요합니다.");
        }
        return user;
    }

    /**
     * Administrators only. Anyone else — including an unauthenticated caller — gets 403, matching
     * {@code if (await authorizedRole() !== 'admin')} in {@code app/api/members/route.ts}.
     */
    public static ChatGptUser requireAdmin(ChatGptUser user) {
        if (user == null || user.role() != AppRole.ADMIN) {
            throw ApiException.forbidden("관리자 권한이 필요합니다.");
        }
        return user;
    }
}
