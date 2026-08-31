package com.globalaffairs.handover.account;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing against a single employee number.
 *
 * <p>Deliberately in memory: it is a speed bump, not an audit trail, and one instance of this
 * service is what the deployment runs. Anything stronger — a shared counter, a lockout an
 * administrator has to clear — would want a store and an unlock path, and neither is worth building
 * before this login has ever been used in anger.
 */
@Component
public class LoginThrottle {

    private static final int MAX_FAILURES = 10;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private record Failures(int count, Instant since) {}

    private final Map<String, Failures> byEmployeeId = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginThrottle(Clock clock) {
        this.clock = clock;
    }

    /** True while the employee number has spent its attempts and the window has not yet rolled over. */
    public boolean isBlocked(String employeeId) {
        Failures failures = byEmployeeId.get(employeeId);
        if (failures == null) {
            return false;
        }
        if (failures.since().plus(WINDOW).isBefore(clock.instant())) {
            byEmployeeId.remove(employeeId, failures);
            return false;
        }
        return failures.count() >= MAX_FAILURES;
    }

    public void recordFailure(String employeeId) {
        Instant now = clock.instant();
        byEmployeeId.merge(
                employeeId,
                new Failures(1, now),
                (existing, fresh) -> existing.since().plus(WINDOW).isBefore(now)
                        ? fresh
                        : new Failures(existing.count() + 1, existing.since()));
    }

    public void clear(String employeeId) {
        byEmployeeId.remove(employeeId);
    }
}
