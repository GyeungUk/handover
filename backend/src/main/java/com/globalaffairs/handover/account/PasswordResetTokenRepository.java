package com.globalaffairs.handover.account;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, String> {

    /** The outstanding codes for an account: a new request invalidates them, a use consumes one. */
    List<PasswordResetToken> findByEmployeeIdAndUsedAtIsNull(String employeeId);

    Optional<PasswordResetToken> findByTokenHashAndEmployeeId(String tokenHash, String employeeId);

    /** How many codes were asked for recently — the rate limit reads this. */
    @Query("""
            select count(t) from PasswordResetToken t
            where t.employeeId = :employeeId and t.createdAt > :since
            """)
    long countRecent(@Param("employeeId") String employeeId, @Param("since") Instant since);

    @Modifying
    @Query("delete from PasswordResetToken t where t.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
