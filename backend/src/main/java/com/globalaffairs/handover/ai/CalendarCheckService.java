package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.AlignmentResponse;
import com.globalaffairs.handover.ai.dto.PersonSummary;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.AcademicYear;
import com.globalaffairs.handover.domain.CalendarShift;
import com.globalaffairs.handover.domain.DateSpan;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.schedule.TaskPeriod;
import com.globalaffairs.handover.schedule.TaskPeriodRepository;
import com.globalaffairs.handover.schedule.TaskReschedule;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import com.globalaffairs.handover.schedule.WorkspacePlan;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compares a person's plan against the next academic calendar and proposes the moves.
 * Port of {@code app/api/calendar-check/route.ts}.
 */
@Service
public class CalendarCheckService {

    private static final int MAX_SHIFT = 4;
    private static final int REASON_MAX = 220;
    private static final int NOTE_MAX = 160;

    private static final String NOT_CONFIGURED = "학사일정 점검 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

    /** Proposals first, then what the author has to judge, then what is staying put. */
    private static final List<String> REVIEW_ORDER = List.of("shift", "review", "keep");

    private final OrgData orgData;
    private final WorkspacePlan plan;
    private final AcademicCalendar calendar;
    private final TaskRescheduleRepository repository;
    private final TaskPeriodRepository periods;
    private final OpenAiClient openAiClient;
    private final AiResources resources;

    public CalendarCheckService(
            OrgData orgData,
            WorkspacePlan plan,
            AcademicCalendar calendar,
            TaskRescheduleRepository repository,
            TaskPeriodRepository periods,
            OpenAiClient openAiClient,
            AiResources resources) {
        this.orgData = orgData;
        this.plan = plan;
        this.calendar = calendar;
        this.repository = repository;
        this.periods = periods;
        this.openAiClient = openAiClient;
        this.resources = resources;
    }

    @Transactional(readOnly = true)
    public AlignmentResponse check(String personId, Integer year) {
        WorkspacePlan.Profile person = plan.profile(personId)
                .orElseThrow(() -> ApiException.badRequest("담당자를 찾을 수 없습니다."));

        AcademicYear target = calendar.findYear(year)
                .filter(item -> item.year() != calendar.baseYear())
                .orElseThrow(() -> ApiException.badRequest("비교할 학사일정이 없는 학년도입니다."));
        int toYear = target.year();

        List<CalendarShift> shifts = calendar.compare(calendar.baseYear(), toYear);
        Set<String> anchorNames = target.events().stream().map(event -> event.name()).collect(Collectors.toSet());
        Map<String, CalendarShift> shiftByName = shifts.stream()
                .collect(Collectors.toMap(CalendarShift::name, shift -> shift, (first, second) -> first));

        /* The plan the workspace draws: seed tasks minus the deleted ones, plus the authored ones.
           Proposing a move for a task that is no longer on the calendar only ever ends in the
           reschedule endpoint refusing it. */
        List<Task> tasks = currentTasks(plan.tasks(personId), repository.findByPersonIdOrderByIdAsc(personId));

        /* A task whose days are settled has nothing to align: the alignment moves week slots, and
           this task's slots are already only a shadow of the dates that outrank them. It is left out
           of what the model is asked about and comes back as a `keep` naming the period, so the
           review still accounts for every task on the calendar. */
        Map<String, DateSpan> fixedByTitle = new LinkedHashMap<>();
        for (TaskPeriod period : periods.findByPersonIdOrderByStartsOnAsc(personId)) {
            fixedByTitle.put(period.getTaskTitle(), new DateSpan(period.getStartsOn(), period.getEndsOn()));
        }
        List<Task> movable = tasks.stream().filter(task -> !fixedByTitle.containsKey(task.title())).toList();

        JsonNode answer = null;
        String notice = "";
        try {
            openAiClient.requireConfigured(NOT_CONFIGURED);
            answer = openAiClient.ask(
                    "calendar-check",
                    "calendar_alignment",
                    resources.schema("calendar-check"),
                    resources.prompt("calendar-check"),
                    buildUserContent(person, toYear, shifts, movable));
        } catch (ApiException failure) {
            if (failure.status() != HttpStatus.BAD_GATEWAY && failure.status() != HttpStatus.SERVICE_UNAVAILABLE) {
                throw failure;
            }
            notice = "외부 분석 연결 없이 공개된 학사일정 변동만 기준으로 점검했습니다. 업무별 일정은 현재 상태로 유지됩니다.";
        }

        return new AlignmentResponse(
                new PersonSummary(person.id(), person.name(), person.role(), person.teamTitle()),
                calendar.baseYear(),
                toYear,
                shifts,
                answer == null
                        ? defaultItems(tasks, fixedByTitle)
                        : readItems(answer, tasks, fixedByTitle, anchorNames, shiftByName),
                calendar.alignmentActionLabels(),
                notice);
    }

    /** Latest recorded move wins, exactly like the calendar view resolves a task's real start. */
    private List<Task> currentTasks(List<Task> tasks, List<TaskReschedule> moves) {
        return tasks.stream()
                .map(task -> {
                    List<TaskReschedule> trail = moves.stream()
                            .filter(move -> move.getTaskTitle().equals(task.title()))
                            .toList();
                    return trail.isEmpty() ? task : task.withStart(trail.get(trail.size() - 1).getToStart());
                })
                .sorted(Comparator.comparingInt(Task::start))
                .toList();
    }

    private String buildUserContent(
            WorkspacePlan.Profile person, int toYear, List<CalendarShift> shifts, List<Task> tasks) {
        List<String> lines = new ArrayList<>();
        lines.add("담당자: %s (%s · %s)".formatted(person.name(), person.teamTitle(), person.role()));
        lines.add("학사일정 비교: %d학년도 → %d학년도".formatted(calendar.baseYear(), toYear));
        lines.add("");
        lines.add("학사일정 비교표:");
        shifts.forEach(shift -> lines.add("- %s · %s → %s · %s"
                .formatted(shift.name(), shift.fromLabel(), shift.toLabel(), AcademicCalendar.shiftLabel(shift.shift()))));
        lines.add("");
        lines.add("업무 목록:");
        tasks.forEach(task -> lines.add(String.join("\n",
                "<업무 제목=\"%s\">".formatted(task.title()),
                "현재 기간: %s (%d주)".formatted(orgData.taskPeriodLabel(task), task.duration()),
                "내용: " + task.note(),
                "</업무>")));
        return String.join("\n", lines);
    }

    private List<AlignmentResponse.AlignmentItem> readItems(
            JsonNode answer,
            List<Task> tasks,
            Map<String, DateSpan> fixedByTitle,
            Set<String> anchorNames,
            Map<String, CalendarShift> shiftByName) {
        Map<String, Task> byTitle = tasks.stream()
                .collect(Collectors.toMap(Task::title, task -> task, (first, second) -> first, LinkedHashMap::new));
        Map<String, AlignmentResponse.AlignmentItem> decided = new LinkedHashMap<>();

        for (JsonNode item : answer.path("items")) {
            Task task = byTitle.get(item.path("taskTitle").asText("").trim());
            /* a proposal about a task we did not send, or a second one about the same task, is dropped */
            if (task == null || decided.containsKey(task.title()) || fixedByTitle.containsKey(task.title())) {
                continue;
            }

            /* an anchor only counts if the target calendar really publishes it */
            String proposedAnchor = item.path("anchorEvent").asText("").trim();
            String anchorEvent = anchorNames.contains(proposedAnchor) ? proposedAnchor : "";
            CalendarShift anchor = anchorEvent.isEmpty() ? null : shiftByName.get(anchorEvent);

            int raw = item.path("shiftWeeks").isIntegralNumber() ? item.path("shiftWeeks").asInt() : 0;
            int bounded = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, raw));
            int suggestedStart = task.start() + bounded;
            /*
             * A task may only move as far as the anchor it cites actually moved. A proposal with no
             * anchor, one that outruns its anchor's shift, or one the year cannot hold is downgraded
             * to `review`: the reasoning still reaches the author, but nothing unfounded is offered
             * as a one-click move.
             */
            boolean grounded = anchor != null && bounded == anchor.shift();
            boolean usable = grounded && bounded != 0 && AcademicCalendar.fitsInYear(suggestedStart, task.duration());
            String proposedAction = item.path("action").asText("");
            String evidenceQuote = AiSupport.normalize(item.path("evidenceQuote").asText(""));
            boolean evidenceGrounded = !evidenceQuote.isEmpty()
                    && AiSupport.normalize(task.title() + " " + task.note()).contains(evidenceQuote);
            String action = calendar.alignmentActions().contains(proposedAction) ? proposedAction : "keep";
            if (("shift".equals(action) || "review".equals(action)) && !evidenceGrounded) {
                action = "keep";
            } else if ("shift".equals(action) && !usable) {
                action = "review";
            }
            boolean shifting = "shift".equals(action);
            int finalStart = shifting ? suggestedStart : task.start();
            if ("keep".equals(action)) {
                anchorEvent = "";
                anchor = null;
            }

            decided.put(task.title(), new AlignmentResponse.AlignmentItem(
                    "align-" + decided.size(),
                    task.title(),
                    action,
                    task.start(),
                    finalStart,
                    orgData.weekLabel(task.start()),
                    orgData.weekLabel(finalStart),
                    anchorEvent,
                    anchor == null ? "" : "%s → %s".formatted(anchor.fromLabel(), anchor.toLabel()),
                    anchor == null ? 0 : anchor.shift(),
                    AiSupport.clip(item.path("reason").asText(""), REASON_MAX),
                    "review".equals(action) ? AiSupport.clip(item.path("note").asText(""), NOTE_MAX) : ""));
        }

        /* a task the model skipped keeps its current slot rather than disappearing from the review */
        for (Task task : tasks) {
            if (decided.containsKey(task.title())) {
                continue;
            }
            decided.put(task.title(), keeping(task, decided.size(), fixedByTitle.get(task.title()),
                    "학사일정 변동의 영향이 확인되지 않아 현재 일정을 유지합니다."));
        }

        return decided.values().stream()
                .sorted(Comparator
                        .comparingInt((AlignmentResponse.AlignmentItem item) ->
                                AnnualService.rank(REVIEW_ORDER, item.action()))
                        .thenComparingInt(AlignmentResponse.AlignmentItem::currentStart))
                .toList();
    }

    /** A network-independent, conservative result: the published calendar still compares normally. */
    private List<AlignmentResponse.AlignmentItem> defaultItems(List<Task> tasks, Map<String, DateSpan> fixedByTitle) {
        List<AlignmentResponse.AlignmentItem> items = new ArrayList<>();
        for (Task task : tasks) {
            items.add(keeping(task, items.size(), fixedByTitle.get(task.title()),
                    "외부 분석 없이 확인 가능한 학사일정 변동만 비교하여 현재 일정을 유지합니다."));
        }
        return List.copyOf(items);
    }

    /**
     * A task that is staying where it is, and why.
     *
     * <p>A date-fixed task says so instead of citing the calendar comparison: the reader is deciding
     * whether to adopt a move, and "그 업무는 이미 날짜가 잡혀 있다" is the reason there is none.
     */
    private AlignmentResponse.AlignmentItem keeping(Task task, int index, DateSpan fixed, String reason) {
        String label = fixed == null ? orgData.weekLabel(task.start()) : fixed.label();
        return new AlignmentResponse.AlignmentItem(
                "align-" + index,
                task.title(),
                "keep",
                task.start(),
                task.start(),
                label,
                label,
                "",
                "",
                0,
                fixed == null ? reason : "날짜가 확정된 업무(%s)이므로 학사일정 정렬 대상에서 제외합니다.".formatted(fixed.label()),
                "");
    }
}
