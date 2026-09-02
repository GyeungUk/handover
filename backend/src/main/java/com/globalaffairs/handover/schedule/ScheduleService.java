package com.globalaffairs.handover.schedule;

import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Recording and reading task reschedules. Port of {@code app/api/schedules/route.ts}. */
@Service
public class ScheduleService {

    private static final int REASON_MAX = 300;

    private final TaskRescheduleRepository repository;
    private final TaskPeriodRepository periods;
    private final WorkspacePlan plan;
    private final AcademicCalendar calendar;
    private final Clock clock;

    public ScheduleService(
            TaskRescheduleRepository repository,
            TaskPeriodRepository periods,
            WorkspacePlan plan,
            AcademicCalendar calendar,
            Clock clock) {
        this.repository = repository;
        this.periods = periods;
        this.plan = plan;
        this.calendar = calendar;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ScheduleChangeResponse> changes() {
        return repository.findAllByOrderByIdAsc().stream().map(ScheduleChangeResponse::from).toList();
    }

    /**
     * Appends one move. Validation order is the order the Next.js route used, because the frontend
     * shows whichever message comes back first.
     */
    @Transactional
    public ScheduleChangeResponse record(
            String personId, String taskTitle, Integer toStart, String reason, String changedBy) {
        if (personId == null || personId.isBlank() || taskTitle == null || taskTitle.isBlank()) {
            throw ApiException.badRequest("유효한 업무 정보가 필요합니다.");
        }

        String key = OrgData.taskKey(personId, taskTitle);
        Task seedTask = plan.findTask(personId, taskTitle)
                .orElseThrow(() -> ApiException.badRequest("존재하지 않는 업무입니다."));

        /* Moving a task by week slot says nothing about a task whose days are already settled, and
           whatever it said would be overruled by the period the moment the calendar redrew it. The
           author has to decide which of the two is true, so the period is named rather than moved. */
        if (periods.existsById(key)) {
            throw ApiException.badRequest("날짜가 확정된 업무입니다. 확정 기간을 수정하거나 해제한 뒤 변경해 주세요.");
        }

        if (toStart == null || toStart < 0 || toStart + seedTask.duration() > OrgData.WEEKS_IN_YEAR) {
            /* The year is named from the calendar data, so the message follows a year roll-over. */
            throw ApiException.badRequest(
                    "변경할 일정이 %s 안에 있어야 합니다.".formatted(calendar.baseYearLabel()));
        }

        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.length() < 2) {
            throw ApiException.badRequest("일정 변경 사유를 입력해 주세요.");
        }
        if (trimmedReason.length() > REASON_MAX) {
            throw ApiException.badRequest("변경 사유는 %d자 이내로 입력해 주세요.".formatted(REASON_MAX));
        }

        int fromStart = repository.findFirstByTaskKeyOrderByIdDesc(key)
                .map(TaskReschedule::getToStart)
                .orElse(seedTask.start());
        if (fromStart == toStart) {
            throw ApiException.badRequest("현재와 동일한 일정입니다.");
        }

        Instant changedAt = Instant.now(clock);
        TaskReschedule saved = repository.save(new TaskReschedule(
                key, personId, taskTitle, fromStart, toStart, trimmedReason, changedBy, changedAt));
        return ScheduleChangeResponse.from(saved);
    }
}
