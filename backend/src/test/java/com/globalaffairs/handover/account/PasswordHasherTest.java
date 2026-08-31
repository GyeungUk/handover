package com.globalaffairs.handover.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Password storage: salted, verifiable, and upgradeable without locking anyone out. */
class PasswordHasherTest {

    /** A small count keeps the suite quick; production uses {@link PasswordHasher#ITERATIONS}. */
    private final PasswordHasher hasher = new PasswordHasher(1_000);

    @Test
    void verifiesThePasswordItHashed() {
        String stored = hasher.hash("handover-2026");

        assertThat(hasher.matches("handover-2026", stored)).isTrue();
        assertThat(hasher.matches("handover-2027", stored)).isFalse();
    }

    @Test
    void saltsEachHashSoTwoAccountsWithOnePasswordLookUnrelated() {
        assertThat(hasher.hash("handover-2026")).isNotEqualTo(hasher.hash("handover-2026"));
    }

    @Test
    void recordsTheIterationCountSoItCanBeRaisedLater() {
        String stored = hasher.hash("handover-2026");

        assertThat(stored).startsWith("pbkdf2-sha256$1000$");
        assertThat(hasher.needsRehash(stored)).isFalse();
        assertThat(new PasswordHasher(2_000).needsRehash(stored)).isTrue();
        /* The stronger hasher must still verify what the weaker one wrote, or sign-in would fail. */
        assertThat(new PasswordHasher(2_000).matches("handover-2026", stored)).isTrue();
    }

    @Test
    void treatsAnUnreadableStoredValueAsAFailedMatchRatherThanAnError() {
        assertThat(hasher.matches("handover-2026", "not-a-hash")).isFalse();
        assertThat(hasher.matches("handover-2026", null)).isFalse();
        assertThat(hasher.needsRehash("not-a-hash")).isTrue();
    }

    @Test
    void digestsATokenTheSameWayEveryTime() {
        assertThat(PasswordHasher.tokenDigest("abc"))
                .isEqualTo(PasswordHasher.tokenDigest("abc"))
                .hasSize(64)
                .isNotEqualTo(PasswordHasher.tokenDigest("abd"));
    }
}
