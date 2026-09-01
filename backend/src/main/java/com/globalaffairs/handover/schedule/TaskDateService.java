package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and records the confirmed dates inside a task's week span.
 *
 * <p>A date has to land inside the span of the task it belongs to. That is not bookkeeping: the
 * month grid draws the task as a band across the days its weeks stand for and marks these dates on
 * it, so a date outside the band would be recorded and then never shown. Rejecting it names the
 * window instead, which is also the cheapest way to catch the wrong month being typed.
 *
 * <p>The span is the task's <em>current</em> one, reschedules included, for the same reason: the
 * band the workspace draws is the moved one.
 */
@Service
public class TaskDateService {

    private static final int LABEL_MAX = 60;

    /** Enough for a group appointment run in sessions, few enough that the day cell stays readable. */
    private static final int PER_TASK_MAX = 12;

    private final TaskDateRepository repository;
    private final TaskRescheduleRepository reschedules;
    private final CustomTaskRepository customTasks;
    private final RemovedTaskRepository removedTasks;
    private final OrgData orgData;
    private final AcademicCalendar calendar;
    private final Clock clock;

    public TaskDateService(
            TaskDateRepository repository,
            TaskRescheduleRepository reschedules,
            CustomTaskRepository customTasks,
            RemovedTaskRepository removedTasks,
            OrgData orgData,
            AcademicCalendar calendar,
            Clock clock) {
        this.repository = repository;
        this.reschedules = reschedules;
        this.customTasks = customTasks;
        this.removedTasks = removedTasks;
        this.orgData = orgData;
        this.calendar = calendar;
        this.clock = clock;
    }

    /** Every confirmed date in the workspace; the calendar marks them all in one pass. */
    @Transactional(readOnly = true)
    public List<TaskDateResponse> dates() {
        return repository.findAllByOrderByDateAscIdAsc().stream().map(TaskDateResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<TaskDateResponse> dates(String personId, String taskTitle) {
        String key = requireTask(personId, taskTitle).key();
        return repository.findByTaskKeyOrderByDateAscIdAsc(key).stream().map(TaskDateResponse::from).toList();
    }

    /** One day and what happens on it, as the request carries it before anything is validated. */
    public record NewDate(String date, String label) {}

    @Transactional
    public TaskDateResponse add(String personId, String taskTitle, String date, String label, String createdBy) {
        return addAll(personId, taskTitle, List.of(new NewDate(date, label)), createdBy).get(0);
    }

    /**
     * Records several days in one go, for a year's worth pasted out of a circular or a spreadsheet.
     *
     * <p>All or nothing: a batch that is half accepted leaves the caller unable to say what it now
     * holds without re-reading it, and the workspace filters the rows it knows are bad before
     * sending them anyway. The message names the day at fault rather than the row number, because
     * what came back from a paste is a list of days and not a list of lines.
     */
    @Transactional
    public List<TaskDateResponse> addAll(
            String personId, String taskTitle, List<NewDate> entries, String createdBy) {
        TaskRef task = requireTask(personId, taskTitle);
        if (entries == null || entries.isEmpty()) {
            throw ApiException.badRequest("확정 일자를 선택해 주세요.");
        }

        LocalDate opensOn = calendar.weekSlotStart(task.start());
        LocalDate closesOn = calendar.weekSlotEnd(task.start() + task.duration() - 1);
        long room = PER_TASK_MAX - repository.countByTaskKey(task.key());
        if (entries.size() > room) {
            throw ApiException.badRequest("한 업무에 등록할 수 있는 일자는 %d개까지입니다.".formatted(PER_TASK_MAX));
        }

        Set<LocalDate> seen = new LinkedHashSet<>();
        List<TaskDate> pending = new ArrayList<>();
        Instant now = Instant.now(clock);
        /* Naming the day answers "which one" in a batch; after a date picker it only repeats it. */
        boolean batch = entries.size() > 1;
        for (NewDate entry : entries) {
            LocalDate confirmed = parseDate(entry.date());
            if (confirmed.isBefore(opensOn) || confirmed.isAfter(closesOn)) {
                throw ApiException.badRequest(
                        "확정 일자는 업무 기간(%s ~ %s) 안에서 선택해 주세요.".formatted(opensOn, closesOn));
            }
            String trimmedLabel = entry.label() == null ? "" : entry.label().trim();
            if (trimmedLabel.length() > LABEL_MAX) {
                throw ApiException.badRequest("일자 설명은 %d자 이내로 입력해 주세요.".formatted(LABEL_MAX));
            }
            if (!seen.add(confirmed) || repository.existsByTaskKeyAndDate(task.key(), confirmed)) {
                throw ApiException.conflict(batch
                        ? "이미 등록된 일자입니다: %s".formatted(confirmed)
                        : "이미 등록된 일자입니다.");
            }
            pending.add(new TaskDate(
                    task.key(), personId.trim(), taskTitle.trim(), confirmed, trimmedLabel, createdBy, now));
        }

        try {
            return repository.saveAllAndFlush(pending).stream().map(TaskDateResponse::from).toList();
        } catch (DataIntegrityViolationException raced) {
            throw ApiException.conflict("이미 등록된 일자입니다.");
        }
    }

    /** Removing a date that is already gone is a 404, so two people deleting it do not both win. */
    @Transactional
    public void delete(Long id) {
        if (id == null) {
            throw ApiException.badRequest("삭제할 일자를 선택해 주세요.");
        }
        TaskDate saved = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("존재하지 않는 일자입니다."));
        repository.delete(saved);
    }

    private LocalDate parseDate(String date) {
        if (date == null || date.isBlank()) {
            throw ApiException.badRequest("확정 일자를 선택해 주세요.");
        }
        try {
            return LocalDate.parse(date.trim());
        } catch (DateTimeParseException malformed) {
            throw ApiException.badRequest("확정 일자를 선택해 주세요.");
        }
    }

    /** The task's identity and the span it currently occupies, reschedules applied. */
    private record TaskRef(String key, int start, int duration) {}

    private TaskRef requireTask(String personId, String taskTitle) {
        if (personId == null || personId.isBlank() || taskTitle == null || taskTitle.isBlank()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }
        String key = OrgData.taskKey(personId.trim(), taskTitle.trim());
        Task task = customTasks.findByPersonIdAndTitle(personId.trim(), taskTitle.trim()).map(CustomTask::asTask)
                .or(() -> removedTasks.existsById(key)
                        ? Optional.empty()
                        : orgData.findSeedTask(personId.trim(), taskTitle.trim()))
                .orElseThrow(() -> ApiException.badRequest("존재하지 않는 업무입니다."));
        int start = reschedules.findFirstByTaskKeyOrderByIdDesc(key)
                .map(TaskReschedule::getToStart)
                .orElse(task.start());
        return new TaskRef(key, start, task.duration());
    }
}
