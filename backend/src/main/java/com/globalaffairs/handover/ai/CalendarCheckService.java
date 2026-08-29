package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.AlignmentResponse;
import com.globalaffairs.handover.ai.dto.PersonSummary;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.AcademicYear;
import com.globalaffairs.handover.domain.CalendarShift;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.schedule.TaskReschedule;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import com.globalaffairs.handover.web.ApiException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
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
    private final AcademicCalendar calendar;
    private final TaskRescheduleRepository repository;
    private final OpenAiClient openAiClient;
    private final AiResources resources;

    public CalendarCheckService(
            OrgData orgData,
            AcademicCalendar calendar,
            TaskRescheduleRepository repository,
            OpenAiClient openAiClient,
            AiResources resources) {
        this.orgData = orgData;
        this.calendar = calendar;
        this.repository = repository;
        this.openAiClient = openAiClient;
        this.resources = resources;
    }

    @Transactional(readOnly = true)
    public AlignmentResponse check(String personId, Integer year) {
        openAiClient.requireConfigured(NOT_CONFIGURED);

        OrgData.PersonRef found = orgData.findPerson(personId)
                .orElseThrow(() -> ApiException.badRequest("담당자를 찾을 수 없습니다."));

        AcademicYear target = calendar.findYear(year)
                .filter(item -> item.year() != calendar.baseYear())
                .orElseThrow(() -> ApiException.badRequest("비교할 학사일정이 없는 학년도입니다."));
        int toYear = target.year();

        List<CalendarShift> shifts = calendar.compare(calendar.baseYear(), toYear);
        Set<String> anchorNames = target.events().stream().map(event -> event.name()).collect(Collectors.toSet());
        Map<String, CalendarShift> shiftByName = shifts.stream()
                .collect(Collectors.toMap(CalendarShift::name, shift -> shift, (first, second) -> first));

        List<Task> tasks = currentTasks(found.person().tasks(), repository.findByPersonIdOrderByIdAsc(personId));

        JsonNode answer = openAiClient.ask(
                "calendar-check",
                "calendar_alignment",
                resources.schema("calendar-check"),
                resources.prompt("calendar-check"),
                buildUserContent(found, toYear, shifts, tasks));

        return new AlignmentResponse(
                new PersonSummary(found.person().id(), found.person().name(), found.person().role(), found.team().title()),
                calendar.baseYear(),
                toYear,
                shifts,
                readItems(answer, tasks, anchorNames, shiftByName),
                calendar.alignmentActionLabels());
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
            OrgData.PersonRef found, int toYear, List<CalendarShift> shifts, List<Task> tasks) {
        List<String> lines = new ArrayList<>();
        lines.add("담당자: %s (%s · %s)".formatted(found.person().name(), found.team().title(), found.person().role()));
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
            JsonNode answer, List<Task> tasks, Set<String> anchorNames, Map<String, CalendarShift> shiftByName) {
        Map<String, Task> byTitle = tasks.stream()
                .collect(Collectors.toMap(Task::title, task -> task, (first, second) -> first, LinkedHashMap::new));
        Map<String, AlignmentResponse.AlignmentItem> decided = new LinkedHashMap<>();

        for (JsonNode item : answer.path("items")) {
            Task task = byTitle.get(item.path("taskTitle").asText("").trim());
            /* a proposal about a task we did not send, or a second one about the same task, is dropped */
            if (task == null || decided.containsKey(task.title())) {
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
            String action = calendar.alignmentActions().contains(proposedAction)
                    ? ("shift".equals(proposedAction) && !usable ? "review" : proposedAction)
                    : "keep";
            boolean shifting = "shift".equals(action);
            int finalStart = shifting ? suggestedStart : task.start();

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
                    AiSupport.clip(item.path("note").asText(""), NOTE_MAX)));
        }

        /* a task the model skipped keeps its current slot rather than disappearing from the review */
        for (Task task : tasks) {
            if (decided.containsKey(task.title())) {
                continue;
            }
            decided.put(task.title(), new AlignmentResponse.AlignmentItem(
                    "align-" + decided.size(),
                    task.title(),
                    "keep",
                    task.start(),
                    task.start(),
                    orgData.weekLabel(task.start()),
                    orgData.weekLabel(task.start()),
                    "",
                    "",
                    0,
                    "학사일정 변동의 영향이 확인되지 않아 현재 일정을 유지합니다.",
                    ""));
        }

        return decided.values().stream()
                .sorted(Comparator
                        .comparingInt((AlignmentResponse.AlignmentItem item) ->
                                AnnualService.rank(REVIEW_ORDER, item.action()))
                        .thenComparingInt(AlignmentResponse.AlignmentItem::currentStart))
                .toList();
    }
}
