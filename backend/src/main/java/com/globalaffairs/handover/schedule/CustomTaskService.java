package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates, lists and deletes the workspace's calendar tasks.
 *
 * <p>Deletion has to cover two kinds of task. One authored here is a row, so it goes; one from the
 * shipped seed plan is not, so its key is written to {@code removed_tasks} and every reader skips
 * it from then on. Either way the task's reschedule trail, saved checks, confirmed dates and fixed
 * period go with it — leaving them behind would resurrect the task the moment somebody re-used its
 * name.
 */
@Service
public class CustomTaskService {

    private static final int TITLE_MAX = 80;
    private static final int NOTE_MAX = 500;

    private final CustomTaskRepository repository;
    private final RemovedTaskRepository removedTasks;
    private final TaskRescheduleRepository reschedules;
    private final TaskChecklistItemRepository checklistItems;
    private final TaskDateRepository taskDates;
    private final TaskPeriodService taskPeriods;
    private final CustomMemberRepository customMembers;
    private final OrgData orgData;
    private final AcademicCalendar calendar;
    private final Clock clock;

    private record PreparedTask(
            String personId,
            String title,
            int start,
            int duration,
            String note,
            String startsOn,
            String endsOn,
            boolean fixed) {}

    public CustomTaskService(
            CustomTaskRepository repository,
            RemovedTaskRepository removedTasks,
            TaskRescheduleRepository reschedules,
            TaskChecklistItemRepository checklistItems,
            TaskDateRepository taskDates,
            TaskPeriodService taskPeriods,
            CustomMemberRepository customMembers,
            OrgData orgData,
            AcademicCalendar calendar,
            Clock clock) {
        this.repository = repository;
        this.removedTasks = removedTasks;
        this.reschedules = reschedules;
        this.checklistItems = checklistItems;
        this.taskDates = taskDates;
        this.taskPeriods = taskPeriods;
        this.customMembers = customMembers;
        this.orgData = orgData;
        this.calendar = calendar;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CustomTaskResponse> tasks() {
        return repository.findAllByOrderByPersonIdAscStartAscIdAsc().stream()
                .map(CustomTaskResponse::from)
                .toList();
    }

    /** The seed-plan tasks that have been deleted, as {@code personId::title} keys. */
    @Transactional(readOnly = true)
    public List<String> removedTaskKeys() {
        return removedTasks.findAllByOrderByTaskKeyAsc().stream().map(RemovedTask::getTaskKey).toList();
    }

    /**
     * Creates a task, either planned in week slots or fixed to real dates.
     *
     * <p>A task given dates still gets a week span, derived from them: the year views lay every task
     * out on the 48-week track and the row itself is constrained to the year, so there is no such
     * thing as a task without a slot. What the dates buy is the period record alongside it, which
     * then outranks the slots wherever days are drawn. Both are written in one transaction — a task
     * that appeared on the wrong days until a second request landed would be worse than no task.
     */
    @Transactional
    public CustomTaskResponse create(
            String personId,
            String title,
            Integer start,
            Integer duration,
            String note,
            String startsOn,
            String endsOn,
            String createdBy) {
        return persist(prepare(personId, title, start, duration, note, startsOn, endsOn), createdBy);
    }

    /**
     * Creates the same task for several people as one transaction.
     *
     * <p>Every target is validated before the first row is written. That makes a team add all-or-
     * nothing: a duplicate title for one teammate cannot leave the other teammates with a task the
     * team believes was never created.
     */
    @Transactional
    public List<CustomTaskResponse> createMany(
            List<String> personIds,
            String title,
            Integer start,
            Integer duration,
            String note,
            String startsOn,
            String endsOn,
            String createdBy) {
        List<String> targets = personIds == null
                ? List.of()
                : personIds.stream()
                        .map(personId -> personId == null ? "" : personId.trim())
                        .filter(personId -> !personId.isEmpty())
                        .distinct()
                        .toList();
        if (targets.isEmpty()) {
            throw ApiException.badRequest("일정을 등록할 파트원을 선택해 주세요.");
        }

        List<PreparedTask> prepared = targets.stream()
                .map(personId -> prepare(personId, title, start, duration, note, startsOn, endsOn))
                .toList();
        return prepared.stream().map(task -> persist(task, createdBy)).toList();
    }

    private PreparedTask prepare(
            String personId,
            String title,
            Integer start,
            Integer duration,
            String note,
            String startsOn,
            String endsOn) {
        String normalizedPersonId = personId == null ? "" : personId.trim();
        String normalizedTitle = title == null ? "" : title.trim();
        String normalizedNote = note == null ? "" : note.trim();

        if (normalizedPersonId.isEmpty()
                || (!orgData.isKnownPerson(normalizedPersonId) && !customMembers.existsById(normalizedPersonId))) {
            throw ApiException.badRequest("담당자를 선택해 주세요.");
        }
        if (normalizedTitle.isEmpty()) {
            throw ApiException.badRequest("일정명을 입력해 주세요.");
        }
        if (normalizedTitle.length() > TITLE_MAX) {
            throw ApiException.badRequest("일정명은 %d자 이내로 입력해 주세요.".formatted(TITLE_MAX));
        }
        if (normalizedNote.length() > NOTE_MAX) {
            throw ApiException.badRequest("업무 설명은 %d자 이내로 입력해 주세요.".formatted(NOTE_MAX));
        }
        boolean hasStartDate = startsOn != null && !startsOn.isBlank();
        boolean hasEndDate = endsOn != null && !endsOn.isBlank();
        if (hasStartDate != hasEndDate) {
            throw ApiException.badRequest("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
        }
        boolean fixed = hasStartDate;
        if (fixed) {
            /* The slots follow the dates rather than whatever the form last had selected, so the two
               halves of a date-fixed task cannot be created disagreeing about which month it is in. */
            LocalDate opens = parseDate(startsOn);
            LocalDate closes = parseDate(endsOn);
            if (closes.isBefore(opens)) {
                throw ApiException.badRequest("종료일이 시작일보다 빠를 수 없습니다.");
            }
            if (!calendar.holds(opens) || !calendar.holds(closes)) {
                throw ApiException.badRequest("확정 기간은 %s(%s ~ %s) 안에 있어야 합니다."
                        .formatted(calendar.baseYearLabel(), calendar.startsOn(), calendar.endsBefore().minusDays(1)));
            }
            start = calendar.weekOf(opens);
            duration = Math.max(1, calendar.weekOf(closes) - start + 1);
        }
        if (start == null || duration == null || start < 0 || duration < 1 || start + duration > OrgData.WEEKS_IN_YEAR) {
            throw ApiException.badRequest("일정 기간이 학년도 안에 있어야 합니다.");
        }
        /* A seed title is free again once that seed task has been deleted: the tombstone keeps the
           original hidden, so the new task is the only one under the key. */
        String key = OrgData.taskKey(normalizedPersonId, normalizedTitle);
        boolean seedTitleTaken =
                orgData.findSeedTask(normalizedPersonId, normalizedTitle).isPresent()
                        && !removedTasks.existsById(key);
        if (seedTitleTaken || repository.existsByPersonIdAndTitle(normalizedPersonId, normalizedTitle)) {
            throw ApiException.conflict("같은 담당자에게 동일한 이름의 일정이 이미 있습니다.");
        }

        return new PreparedTask(
                normalizedPersonId,
                normalizedTitle,
                start,
                duration,
                normalizedNote,
                startsOn,
                endsOn,
                fixed);
    }

    private CustomTaskResponse persist(PreparedTask task, String createdBy) {
        try {
            CustomTask saved = repository.saveAndFlush(new CustomTask(
                    task.personId(),
                    task.title(),
                    task.start(),
                    task.duration(),
                    task.note(),
                    createdBy,
                    Instant.now(clock)));
            if (task.fixed()) {
                taskPeriods.set(task.personId(), task.title(), task.startsOn(), task.endsOn(), createdBy);
            }
            return CustomTaskResponse.from(saved);
        } catch (DataIntegrityViolationException raced) {
            throw ApiException.conflict("같은 담당자에게 동일한 이름의 일정이 이미 있습니다.");
        }
    }

    private LocalDate parseDate(String date) {
        try {
            return LocalDate.parse(date.trim());
        } catch (DateTimeParseException malformed) {
            throw ApiException.badRequest("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
        }
    }

    /**
     * Removes one task from the calendar for everyone, along with its reschedule trail, its saved
     * checks, its confirmed dates and its fixed period. Deleting a task that is already gone is a 404
     * rather than a silent success, so two people clicking delete on the same task do not both see it
     * work.
     */
    @Transactional
    public void delete(String personId, String title, String removedBy) {
        String normalizedPersonId = personId == null ? "" : personId.trim();
        String normalizedTitle = title == null ? "" : title.trim();
        if (normalizedPersonId.isEmpty() || normalizedTitle.isEmpty()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }

        String key = OrgData.taskKey(normalizedPersonId, normalizedTitle);
        Optional<CustomTask> authored = repository.findByPersonIdAndTitle(normalizedPersonId, normalizedTitle);
        if (authored.isPresent()) {
            repository.delete(authored.get());
        } else if (orgData.findSeedTask(normalizedPersonId, normalizedTitle).isPresent()
                && !removedTasks.existsById(key)) {
            removedTasks.save(new RemovedTask(
                    key, normalizedPersonId, normalizedTitle, removedBy, Instant.now(clock)));
        } else {
            throw ApiException.notFound("존재하지 않는 업무입니다.");
        }

        reschedules.deleteByTaskKey(key);
        checklistItems.deleteByTaskKey(key);
        taskDates.deleteByTaskKey(key);
        taskPeriods.deleteFor(key);
    }
}
