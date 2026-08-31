package com.globalaffairs.handover.account;

import com.globalaffairs.handover.web.ApiException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The shape rules for what a person types on the login screen.
 *
 * <p>Kept apart from the service so the messages the frontend renders live in one readable place,
 * and so the rules can be tested without a database. Every message here is user-facing Korean, like
 * the rest of the API.
 */
public final class Credentials {

    /**
     * Employee numbers are digits only — that is the rule the login field enforces with
     * {@code inputMode="numeric"}, and the server is where it actually holds. No minimum length is
     * imposed beyond one digit: the application intentionally accepts every numeric employee ID.
     */
    private static final Pattern EMPLOYEE_ID = Pattern.compile("^[0-9]{1,32}$");

    /** Deliberately loose. A wrong address is caught by the reset mail not arriving, not by a regex. */
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@.]+\\.[^\\s@]+$");

    public static final int MIN_PASSWORD_LENGTH = 8;
    public static final int MAX_PASSWORD_LENGTH = 200;
    private static final int MAX_NAME_LENGTH = 40;
    private static final int MAX_EMAIL_LENGTH = 254;

    private Credentials() {}

    /** The employee number, trimmed, or 400 when it is missing or not all digits. */
    public static String employeeId(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            throw ApiException.badRequest("직번을 입력해 주세요.");
        }
        if (!EMPLOYEE_ID.matcher(value).matches()) {
            throw ApiException.badRequest("직번은 숫자만 입력할 수 있습니다.");
        }
        return value;
    }

    public static String name(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            throw ApiException.badRequest("이름을 입력해 주세요.");
        }
        if (value.length() > MAX_NAME_LENGTH) {
            throw ApiException.badRequest("이름은 " + MAX_NAME_LENGTH + "자 이내로 입력해 주세요.");
        }
        return value;
    }

    /** Lowercased, because it is also the key the handover document is filed under. */
    public static String email(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (value.isEmpty()) {
            throw ApiException.badRequest("이메일 주소를 입력해 주세요.");
        }
        if (value.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(value).matches()) {
            throw ApiException.badRequest("이메일 주소 형식이 올바르지 않습니다.");
        }
        return value;
    }

    /**
     * A new password. The rules are the two that earn their keep: long enough to survive an offline
     * guess against the stored hash, and not the employee number itself — which everyone who can see
     * the login form already knows.
     */
    public static String newPassword(String raw, String employeeId) {
        String value = raw == null ? "" : raw;
        if (value.isBlank()) {
            throw ApiException.badRequest("비밀번호를 입력해 주세요.");
        }
        if (value.length() < MIN_PASSWORD_LENGTH) {
            throw ApiException.badRequest("비밀번호는 " + MIN_PASSWORD_LENGTH + "자 이상이어야 합니다.");
        }
        if (value.length() > MAX_PASSWORD_LENGTH) {
            throw ApiException.badRequest("비밀번호는 " + MAX_PASSWORD_LENGTH + "자 이내로 입력해 주세요.");
        }
        if (value.equals(employeeId)) {
            throw ApiException.badRequest("직번과 같은 비밀번호는 사용할 수 없습니다.");
        }
        if (value.chars().distinct().count() < 4) {
            throw ApiException.badRequest("같은 문자만으로 이루어진 비밀번호는 사용할 수 없습니다.");
        }
        return value;
    }

    /**
     * Hides most of the address the reset mail went to. The person recovering an account needs to
     * recognise which inbox to open; anyone else looking at the screen should learn nothing useful.
     */
    public static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        int dot = domain.lastIndexOf('.');
        String host = dot > 0 ? domain.substring(0, dot) : domain;
        String tail = dot > 0 ? domain.substring(dot) : "";
        return keepFirst(local) + "@" + keepFirst(host) + tail;
    }

    private static String keepFirst(String value) {
        return value.isEmpty() ? "***" : value.charAt(0) + "***";
    }
}
