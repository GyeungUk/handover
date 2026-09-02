package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.DateSpan;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fixing a task's period to real dates, and reading the period every task actually runs on.
 *
 * <p>The plan is planned in week slots and stays that way by default, because most of it is genuinely
 * that vague — "8월 2주부터 5주간" is the honest statement of a campaign nobody scheduled to the day.
 * Writing a date on such a task would invent precision and would leave the academic-year alignment
 * nothing to move. Work whose days really are settled is the other case, and pretending it is vague
 * is its own kind of wrong: the next person inherits "9월 3주" when what happened was 9월 14일부터
 * 9월 18일까지. A task in that state carries a period here.
 *
 * <p>{@link #spanOf} is what the rest of the workspace asks: it answers with the fixed period when
 * there is one and with the days the week slots stand for when there is not, so no reader has to
 * know which kind of task it is holding.
 */
@Service
public class TaskPeriodService {

    private final TaskPeriodRepository repository;
    private final TaskDateRepository taskDates;
    private final WorkspacePlan plan;
    private final AcademicCalendar calendar;
    private final Clock clock;

    public TaskPeriodService(
            TaskPeriodRepository repository,
            TaskDateRepository taskDates,
            WorkspacePlan plan,
            AcademicCalendar calendar,
            Clock clock) {
        this.repository = repository;
        this.taskDates = taskDates;
        this.plan = plan;
        this.calendar = calendar;
        this.clock = clock;
    }

    /** Every fixed period in the workspace; the calendar resolves them all in one pass. */
    @Transactional(readOnly = true)
    public List<TaskPeriodResponse> periods() {
        return repository.findAllByOrderByStartsOnAscTaskKeyAsc().stream().map(this::describe).toList();
    }

    @Transactional(readOnly = true)
    public Optional<TaskPeriod> find(String taskKey) {
        return repository.findById(taskKey);
    }

    /**
     * The days a task covers: its fixed period, or the days its week slots stand for.
     *
     * <p>{@code start} is the task's <em>current</em> start, reschedules applied, for the same reason
     * the band on the month grid is the moved one — a window that disagreed with what is drawn would
     * reject dates the user can see room for.
     */
    @Transactional(readOnly = true)
    public DateSpan spanOf(String taskKey, int start, int duration) {
        return repository.findById(taskKey)
                .map(period -> new DateSpan(period.getStartsOn(), period.getEndsOn()))
                .orElseGet(() -> calendar.weekSpan(start, duration));
    }

    /**
     * Fixes a task to real dates, or moves the dates it is already fixed to.
     *
     * <p>Confirmed days already recorded against the task have to survive the move: a period that
     * left one outside would keep a day the month grid can no longer mark. Rejecting names the day
     * at fault, which is the only thing the author can act on.
     */
    @Transactional
    public TaskPeriodResponse set(String personId, String taskTitle, String startsOn, String endsOn, String setBy) {
        String id = personId == null ? "" : personId.trim();
        String title = taskTitle == null ? "" : taskTitle.trim();
        if (plan.findTask(id, title).isEmpty()) {
            throw ApiException.badRequest("존재하지 않는 업무입니다.");
        }

        LocalDate opens = parseDate(startsOn);
        LocalDate closes = parseDate(endsOn);
        if (closes.isBefore(opens)) {
            throw ApiException.badRequest("종료일이 시작일보다 빠를 수 없습니다.");
        }
        if (!calendar.holds(opens) || !calendar.holds(closes)) {
            throw ApiException.badRequest("확정 기간은 %s(%s ~ %s) 안에 있어야 합니다."
                    .formatted(calendar.baseYearLabel(), calendar.startsOn(), calendar.endsBefore().minusDays(1)));
        }

        String key = OrgData.taskKey(id, title);
        DateSpan fixed = new DateSpan(opens, closes);
        taskDates.findByTaskKeyOrderByDateAscIdAsc(key).stream()
                .map(TaskDate::getDate)
                .filter(date -> !fixed.covers(date))
                .findFirst()
                .ifPresent(stranded -> {
                    throw ApiException.badRequest(
                            "이미 등록된 확정 일자 %s이(가) 새 기간을 벗어납니다. 해당 일자를 먼저 정리해 주세요."
                                    .formatted(stranded));
                });

        Instant now = Instant.now(clock);
        TaskPeriod period = repository.findById(key)
                .map(existing -> {
                    existing.moveTo(opens, closes, setBy, now);
                    return existing;
                })
                .orElseGet(() -> new TaskPeriod(key, id, title, opens, closes, setBy, now));
        return describe(repository.saveAndFlush(period));
    }

    /**
     * Un-fixes a task, which returns it to the week slots it was always planned on.
     *
     * <p>Nothing is recomputed on the way out: the week slots never stopped being the task's own, the
     * period only outranked them, so clearing it is enough. Clearing a period a task does not have is
     * a 404 rather than a silent success, so two people clicking it do not both see it work.
     */
    @Transactional
    public void clear(String personId, String taskTitle) {
        String id = personId == null ? "" : personId.trim();
        String title = taskTitle == null ? "" : taskTitle.trim();
        if (id.isEmpty() || title.isEmpty()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }
        TaskPeriod saved = repository.findById(OrgData.taskKey(id, title))
                .orElseThrow(() -> ApiException.notFound("확정된 기간이 없는 업무입니다."));
        repository.delete(saved);
    }

    /** Removes a task's period along with the task. Deleting one that has none is a no-op. */
    @Transactional
    public void deleteFor(String taskKey) {
        repository.deleteByTaskKey(taskKey);
    }

    private LocalDate parseDate(String date) {
        if (date == null || date.isBlank()) {
            throw ApiException.badRequest("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
        }
        try {
            return LocalDate.parse(date.trim());
        } catch (DateTimeParseException malformed) {
            throw ApiException.badRequest("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
        }
    }

    /**
     * A period as the workspace reads it, week slots included.
     *
     * <p>The year views place every task on the 48-week track, so a date-fixed task needs a slot
     * there too and it is derived from the dates rather than left as whatever the plan happened to
     * say. A period that opens and closes inside one slot is one slot long, however few days it runs
     * — the track has no way to draw less than a slot.
     */
    private TaskPeriodResponse describe(TaskPeriod period) {
        int startWeek = calendar.weekOf(period.getStartsOn());
        int duration = Math.max(1, calendar.weekOf(period.getEndsOn()) - startWeek + 1);
        return TaskPeriodResponse.from(period, startWeek, duration);
    }
}
