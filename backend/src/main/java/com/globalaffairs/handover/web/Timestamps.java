package com.globalaffairs.handover.web;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Formats an instant exactly the way JavaScript's {@code Date.toISOString()} did, so a
 * {@code changedAt} the frontend receives from Spring is byte-identical to one it received from the
 * Worker: UTC, always three fractional digits, trailing {@code Z}.
 */
public final class Timestamps {

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private Timestamps() {}

    public static String toIsoString(Instant instant) {
        return ISO_MILLIS.format(instant);
    }
}
