package com.globalaffairs.handover.domain;

import java.time.LocalDate;

/**
 * The first and last calendar date a task covers, both ends inclusive.
 *
 * <p>A task's span comes from one of two places. Most tasks are planned in week slots and their
 * span is the days those slots stand for — derived, and moved wholesale when the academic calendar
 * shifts. A task whose days are actually settled carries a fixed period instead, and its span is
 * those dates exactly. Everything that needs a window — the band the month grid draws, the days a
 * confirmed date may fall on — asks for the span rather than re-deriving one from week slots, so
 * the two kinds of task are the same shape to every reader.
 */
public record DateSpan(LocalDate from, LocalDate to) {

    public boolean covers(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(to);
    }

    /** "8월 12일 ~ 9월 3일" — how a span reads where a week label would otherwise stand. */
    public String label() {
        return "%d월 %d일 ~ %d월 %d일"
                .formatted(from.getMonthValue(), from.getDayOfMonth(), to.getMonthValue(), to.getDayOfMonth());
    }
}
