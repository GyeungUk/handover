package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The university's academic calendar, which shifts by a week or two every year.
 *
 * <p>Port of {@code app/academic-calendar.ts}. The published anchors come from
 * {@code domain/academic-calendar.json}, exported from the TypeScript module by
 * {@code backend/tools/export-domain-data.mjs}.
 */
@Component
public class AcademicCalendar {

    private final int baseYear;
    private final List<AcademicYear> years;
    private final Map<String, String> alignmentActionLabels;
    private final OrgData orgData;

    public AcademicCalendar(ObjectMapper objectMapper, OrgData orgData) {
        this.orgData = orgData;
        try (InputStream stream = new ClassPathResource("domain/academic-calendar.json").getInputStream()) {
            Export export = objectMapper.readValue(stream, Export.class);
            this.baseYear = export.baseYear();
            this.years = List.copyOf(export.years());
            /* Map.copyOf would discard the exported order that the review listing depends on. */
            this.alignmentActionLabels =
                    Collections.unmodifiableMap(new LinkedHashMap<>(export.alignmentActionLabels()));
        } catch (IOException failure) {
            throw new IllegalStateException("could not load domain/academic-calendar.json", failure);
        }
    }

    private record Export(
            int baseYear, List<AcademicYear> years, Map<String, String> alignmentActionLabels) {}

    public int baseYear() {
        return baseYear;
    }

    /**
     * Alignment action key to its Korean label, e.g. {@code shift} to 일정 조정 제안. Exported from
     * {@code app/academic-calendar.ts} rather than retyped, so the workspace and the API agree.
     */
    public Map<String, String> alignmentActionLabels() {
        return alignmentActionLabels;
    }

    /** The alignment actions the model may choose between, in the order the source declares them. */
    public List<String> alignmentActions() {
        return List.copyOf(alignmentActionLabels.keySet());
    }

    /** How the base year is written where a user reads it, e.g. "2026학년도". */
    public String baseYearLabel() {
        return baseYear + "학년도";
    }

    /** First day of the base academic year, derived from the calendar rather than pinned to a date. */
    public LocalDate startsOn() {
        return LocalDate.of(baseYear, orgData.startMonth(), 1);
    }

    /** First day after the base academic year. */
    public LocalDate endsBefore() {
        return startsOn().plusYears(1);
    }

    /**
     * The first calendar date a week slot stands for.
     *
     * <p>Four slots to a month, so slot n opens on its day 7n+1. This is the same arithmetic the
     * month grid draws a task's band with — a confirmed date is validated against the band it will
     * be marked on, so the two cannot disagree about where a week is.
     */
    public LocalDate weekSlotStart(int week) {
        return monthOf(week).plusDays(7L * Math.floorMod(week, OrgData.SLOTS_PER_MONTH));
    }

    /** The last date a week slot stands for; a month's final slot keeps the days left over. */
    public LocalDate weekSlotEnd(int week) {
        LocalDate month = monthOf(week);
        int slot = Math.floorMod(week, OrgData.SLOTS_PER_MONTH);
        return slot == OrgData.SLOTS_PER_MONTH - 1
                ? month.withDayOfMonth(month.lengthOfMonth())
                : month.plusDays(7L * (slot + 1) - 1);
    }

    private LocalDate monthOf(int week) {
        return startsOn().plusMonths(Math.floorDiv(week, OrgData.SLOTS_PER_MONTH));
    }

    /**
     * Locate a real date inside the academic year, or {@link Today#NONE} when it falls outside.
     *
     * <p>The window and the month ordering both come from the exported data — the base year from the
     * calendar, the starting month from the org chart's month labels — so rolling the project over to
     * a new academic year is a data change, not a code change.
     */
    public Today locateToday(LocalDate now) {
        if (now.isBefore(startsOn()) || !now.isBefore(endsBefore())) {
            return Today.NONE;
        }
        int month = Math.floorMod(now.getMonthValue() - orgData.startMonth(), 12);
        int weekOfMonth = Math.min(3, (now.getDayOfMonth() - 1) / 7);
        return new Today(month * 4 + weekOfMonth, month, now.getDayOfMonth());
    }

    public List<AcademicYear> years() {
        return years;
    }

    public Optional<AcademicYear> findYear(Integer year) {
        if (year == null) {
            return Optional.empty();
        }
        return years.stream().filter(item -> item.year() == year).findFirst();
    }

    /** Every anchor the target calendar moved, relative to the source calendar. */
    public List<CalendarShift> compare(int fromYear, int toYear) {
        Optional<AcademicYear> from = findYear(fromYear);
        Optional<AcademicYear> to = findYear(toYear);
        if (from.isEmpty() || to.isEmpty()) {
            return List.of();
        }
        List<CalendarShift> shifts = new ArrayList<>();
        for (AcademicEvent event : to.get().events()) {
            from.get().events().stream()
                    .filter(previous -> previous.name().equals(event.name()))
                    .findFirst()
                    .ifPresent(previous -> shifts.add(new CalendarShift(
                            event.name(),
                            event.phase(),
                            previous.week(),
                            event.week(),
                            orgData.weekLabel(previous.week()),
                            orgData.weekLabel(event.week()),
                            event.week() - previous.week())));
        }
        return List.copyOf(shifts);
    }

    /** "1주 늦어짐" / "1주 당겨짐" / "변동 없음" — how a shift reads in the comparison table. */
    public static String shiftLabel(int shift) {
        if (shift == 0) {
            return "변동 없음";
        }
        return shift > 0 ? "%d주 늦어짐".formatted(shift) : "%d주 당겨짐".formatted(Math.abs(shift));
    }

    /** A task may only be placed where it still finishes inside the academic year. */
    public static boolean fitsInYear(int start, int duration) {
        return start >= 0 && start + duration <= OrgData.WEEKS_IN_YEAR;
    }
}
