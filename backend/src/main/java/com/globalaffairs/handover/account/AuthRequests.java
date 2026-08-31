package com.globalaffairs.handover.account;

/** The bodies {@code /api/auth/*} accepts, kept together so the contract reads in one place. */
public final class AuthRequests {

    private AuthRequests() {}

    /** Step one of the login screen's recovery flow, and the sender of a reset code. */
    public record EmployeeIdRequest(String employeeId) {}

    public record LoginRequest(String employeeId, String password) {}

    /** Re-authentication before permanently deleting the signed-in account. */
    public record DeleteAccountRequest(String password) {}

    /** Creating a password for the first time; the email is where a future reset would be sent. */
    public record RegisterRequest(String employeeId, String name, String email, String password) {}

    /** Finishing a reset with the code from the mail. */
    public record ResetRequest(String employeeId, String code, String password) {}
}
