package com.globalaffairs.handover.account;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, String> {

    /** Emails are unique, and the address is what a colleague would recognise the account by. */
    Optional<Account> findByEmail(String email);
}
