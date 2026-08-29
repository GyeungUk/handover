package com.globalaffairs.handover.domain;

/** One anchor's move between two published calendars. {@code shift} is in week slots. */
public record CalendarShift(
        String name,
        String phase,
        int fromWeek,
        int toWeek,
        String fromLabel,
        String toLabel,
        int shift) {}
