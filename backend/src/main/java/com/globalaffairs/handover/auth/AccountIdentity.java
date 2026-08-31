package com.globalaffairs.handover.auth;

/**
 * What a valid session tells us about the account behind it, before the allow lists decide what it
 * may do. Kept free of any persistence type so the web layer can be tested without a database.
 */
public record AccountIdentity(String employeeId, String name, String email) {}
