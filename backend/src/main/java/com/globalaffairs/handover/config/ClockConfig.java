package com.globalaffairs.handover.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * A single injectable clock. The Worker read {@code new Date()} directly; here the clock is a bean so
 * tests can pin "today" inside the 2026 academic year without waiting for the calendar to agree.
 */
@Configuration
public class ClockConfig {

    @Bean
    @Primary
    public Clock clock() {
        return Clock.systemUTC();
    }
}
