package com.globalaffairs.handover.account;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountSessionRepository extends JpaRepository<AccountSession, String> {

    /** Signing out everywhere: used when a password changes, so an old session cannot outlive it. */
    @Modifying
    @Query("delete from AccountSession s where s.employeeId = :employeeId")
    void deleteByEmployeeId(@Param("employeeId") String employeeId);

    /** Housekeeping, run on sign-in rather than on a timer — there is no scheduler in this service. */
    @Modifying
    @Query("delete from AccountSession s where s.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
