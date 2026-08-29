package com.globalaffairs.handover.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The org chart and the academic-year helpers, ported from {@code app/org-data.ts}.
 *
 * <p>The seed data itself is not retyped here: {@code backend/tools/export-domain-data.mjs}
 * compiles the TypeScript module and writes {@code domain/org-data.json}, which this component
 * loads at startup. Re-run that script whenever the TypeScript data changes.
 */
@Component
public class OrgData {

    /** The academic year is 48 week slots, 4 per month, starting at {@link #startMonth()}. */
    public static final int WEEKS_IN_YEAR = 48;

    private final List<String> months;
    private final List<Team> teams;
    private final int startMonth;

    public OrgData(ObjectMapper objectMapper) {
        try (InputStream stream = new ClassPathResource("domain/org-data.json").getInputStream()) {
            Export export = objectMapper.readValue(stream, Export.class);
            if (export.weeksInYear() != WEEKS_IN_YEAR) {
                throw new IllegalStateException(
                        "domain/org-data.json declares %d weeks but the backend assumes %d"
                                .formatted(export.weeksInYear(), WEEKS_IN_YEAR));
            }
            this.months = List.copyOf(export.months());
            this.teams = List.copyOf(export.teams());
            this.startMonth = parseMonth(this.months.get(0));
        } catch (IOException failure) {
            throw new IllegalStateException("could not load domain/org-data.json", failure);
        }
    }

    private record Export(int weeksInYear, List<String> months, List<Team> teams) {}

    /** "3월" to 3. The labels are the only place the calendar's starting month is written down. */
    private static int parseMonth(String label) {
        try {
            return Integer.parseInt(label.replaceAll("[^0-9]", ""));
        } catch (NumberFormatException malformed) {
            throw new IllegalStateException("month label is not a month: " + label, malformed);
        }
    }

    public List<Team> teams() {
        return teams;
    }

    public List<String> months() {
        return months;
    }

    /**
     * The calendar month the academic year opens on, read from the first month label (e.g. "3월").
     * Keeping it derived means the month ordering and the year window cannot disagree.
     */
    public int startMonth() {
        return startMonth;
    }

    /** Stable identity for a task across reschedules: a person never repeats a task title. */
    public static String taskKey(String personId, String title) {
        return personId + "::" + title;
    }

    /** "3월 2주" — the label used everywhere a week slot is shown to a user. */
    public String weekLabel(int week) {
        return "%s %d주".formatted(months.get(Math.floorDiv(week, 4)), (week % 4) + 1);
    }

    /** "8월 2주 ~ 9월 2주" — the span a task occupies, both ends inclusive. */
    public String taskPeriodLabel(Task task) {
        return "%s ~ %s".formatted(weekLabel(task.start()), weekLabel(task.start() + task.duration() - 1));
    }

    /** The team and person for an id, or empty when the id is not in the org chart. */
    public Optional<PersonRef> findPerson(String personId) {
        if (personId == null) {
            return Optional.empty();
        }
        for (Team team : teams) {
            for (Person person : team.people()) {
                if (person.id().equals(personId)) {
                    return Optional.of(new PersonRef(team, person));
                }
            }
        }
        return Optional.empty();
    }

    public Optional<Task> findSeedTask(String personId, String title) {
        return findPerson(personId).flatMap(found -> found.person().tasks().stream()
                .filter(task -> task.title().equals(title))
                .findFirst());
    }

    /** Every person id the org chart knows, used to validate member ids. */
    public boolean isKnownPerson(String personId) {
        return findPerson(personId).isPresent();
    }

    /** Where a task sits relative to today. */
    public static TaskPhase taskPhase(Task task, int todayWeek) {
        if (task.start() + task.duration() <= todayWeek) {
            return TaskPhase.DONE;
        }
        return task.start() <= todayWeek ? TaskPhase.ACTIVE : TaskPhase.UPCOMING;
    }

    public record PersonRef(Team team, Person person) {}
}
