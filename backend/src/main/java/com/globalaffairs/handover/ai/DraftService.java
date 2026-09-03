package com.globalaffairs.handover.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.globalaffairs.handover.ai.dto.DraftResponse;
import com.globalaffairs.handover.ai.dto.PersonSummary;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.domain.Task;
import com.globalaffairs.handover.domain.TaskPhase;
import com.globalaffairs.handover.domain.Today;
import com.globalaffairs.handover.domain.DateSpan;
import com.globalaffairs.handover.schedule.TaskPeriod;
import com.globalaffairs.handover.schedule.TaskPeriodRepository;
import com.globalaffairs.handover.schedule.TaskReschedule;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import com.globalaffairs.handover.schedule.WorkspacePlan;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds a handover draft from a person's recorded plan. Port of {@code app/api/draft/route.ts}.
 *
 * <p>Everything the model is allowed to say is assembled from records: the seed plan, the phase each
 * task is in today, and the reschedule trail. Nothing else reaches the prompt.
 */
@Service
public class DraftService {

    private static final int MAX_DRAFTS = 16;
    private static final int MAX_QUESTIONS = 3;
    private static final int TITLE_MAX = 80;

    private static final String NOT_CONFIGURED = "AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.";

    private final Set<String> inferableKeys;
    private final OrgData orgData;
    private final WorkspacePlan plan;
    private final HandoverSchema schema;
    private final AcademicCalendar calendar;
    private final TaskRescheduleRepository repository;
    private final TaskPeriodRepository periods;
    private final OpenAiClient openAiClient;
    private final AiResources resources;
    private final AiSupport support;
    private final JsonStringify json;
    private final Clock clock;

    public DraftService(
            OrgData orgData,
            WorkspacePlan plan,
            HandoverSchema schema,
            AcademicCalendar calendar,
            TaskRescheduleRepository repository,
            TaskPeriodRepository periods,
            OpenAiClient openAiClient,
            AiResources resources,
            AiSupport support,
            JsonStringify json,
            DraftProperties properties,
            Clock clock) {
        this.orgData = orgData;
        this.plan = plan;
        this.schema = schema;
        this.calendar = calendar;
        this.inferableKeys = Set.copyOf(properties.inferablePropertyKeys());
        this.repository = repository;
        this.periods = periods;
        this.openAiClient = openAiClient;
        this.resources = resources;
        this.support = support;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public DraftResponse draft(String personId) {
        openAiClient.requireConfigured(NOT_CONFIGURED);

        WorkspacePlan.Profile person = plan.profile(personId)
                .orElseThrow(() -> ApiException.badRequest("담당자를 찾을 수 없습니다."));

        Today today = calendar.locateToday(LocalDate.now(clock));
        if (!today.insideYear()) {
            throw ApiException.badRequest(
                    "%s 기간에만 초안을 만들 수 있습니다.".formatted(calendar.baseYearLabel()));
        }

        /* The plan the workspace draws, not the shipped seed one: tasks deleted here are gone and
           tasks authored here are part of the job the next person inherits. */
        List<Task> tasks = plan.tasks(personId);
        List<TaskReschedule> moves = repository.findByPersonIdOrderByIdAsc(personId);
        List<Map<String, Object>> facts = buildFacts(tasks, moves, periodsOf(personId), today.week());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("담당자", Map.of(
                "이름", person.name(),
                "역할", person.role(),
                "소속파트", person.teamTitle()));
        payload.put("오늘", orgData.weekLabel(today.week()));
        payload.put("허용속성", support.allowedProperties(inferableKeys::contains));
        payload.put("필수출력개수", Map.of(
                "responsibility", 1,
                "plan", facts.stream().filter(item -> !"완료".equals(item.get("진행상태"))).count(),
                "issue", facts.stream().filter(item -> item.containsKey("일정변경")).count(),
                "pending", facts.stream().filter(item -> Boolean.TRUE.equals(item.get("인계시점이후종료"))).count()));
        payload.put("업무목록", facts);

        JsonNode answer = openAiClient.ask(
                "draft",
                "handover_draft",
                resources.schema("draft"),
                resources.prompt("draft"),
                json.pretty(payload));

        Set<String> taskNames = tasks.stream().map(Task::title).collect(java.util.stream.Collectors.toSet());

        return new DraftResponse(
                new PersonSummary(person.id(), person.name(), person.role(), person.teamTitle()),
                orgData.weekLabel(today.week()),
                readDrafts(answer, taskNames, eligiblePairs(facts)));
    }

    /** Latest recorded move wins, exactly like the calendar view resolves a task's real start. */
    private List<TaskWithTrail> effectiveTasks(List<Task> tasks, List<TaskReschedule> moves) {
        List<TaskWithTrail> resolved = new ArrayList<>();
        for (Task task : tasks) {
            List<TaskReschedule> trail = moves.stream()
                    .filter(move -> move.getTaskTitle().equals(task.title()))
                    .toList();
            Task current = trail.isEmpty() ? task : task.withStart(trail.get(trail.size() - 1).getToStart());
            resolved.add(new TaskWithTrail(current, trail));
        }
        resolved.sort(Comparator.comparingInt(entry -> entry.task().start()));
        return resolved;
    }

    private record TaskWithTrail(Task task, List<TaskReschedule> trail) {}

    /** What the model is allowed to say about one task. Assembled from records only. */
    /** The fixed periods of one person's tasks, by task title. */
    private Map<String, DateSpan> periodsOf(String personId) {
        Map<String, DateSpan> spans = new LinkedHashMap<>();
        for (TaskPeriod period : periods.findByPersonIdOrderByStartsOnAsc(personId)) {
            spans.put(period.getTaskTitle(), new DateSpan(period.getStartsOn(), period.getEndsOn()));
        }
        return spans;
    }

    private List<Map<String, Object>> buildFacts(
            List<Task> tasks, List<TaskReschedule> moves, Map<String, DateSpan> periodsByTitle, int todayWeek) {
        List<Map<String, Object>> facts = new ArrayList<>();
        for (TaskWithTrail entry : effectiveTasks(tasks, moves)) {
            Task task = entry.task();
            TaskPhase phase = OrgData.taskPhase(task, todayWeek);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("업무", task.title());
            item.put("설명", task.note());
            /* A task whose days are settled is handed over as those days: telling the next person
               "9월 3주" when the office fixed 9월 14일 is the exact thing the period exists to stop. */
            DateSpan fixed = periodsByTitle.get(task.title());
            item.put("기간", fixed == null ? orgData.taskPeriodLabel(task) : fixed.label());
            if (fixed != null) {
                item.put("날짜확정", true);
            }
            item.put("진행상태", switch (phase) {
                case DONE -> "완료";
                case ACTIVE -> "진행 중";
                case UPCOMING -> "예정";
            });
            if (phase == TaskPhase.ACTIVE) {
                item.put("경과", "%d주 중 %d주차".formatted(task.duration(), todayWeek - task.start() + 1));
                /* set when the task is still running today, so its tail lands on the successor */
                item.put("인계시점이후종료", true);
            }
            if (!entry.trail().isEmpty()) {
                item.put("일정변경", entry.trail().stream()
                        .map(move -> {
                            Map<String, Object> change = new LinkedHashMap<>();
                            change.put("변경전", orgData.weekLabel(move.getFromStart()));
                            change.put("변경후", orgData.weekLabel(move.getToStart()));
                            change.put("사유", move.getReason());
                            return change;
                        })
                        .toList());
            }
            facts.add(item);
        }
        return facts;
    }

    private static Set<String> eligiblePairs(List<Map<String, Object>> facts) {
        Set<String> pairs = new java.util.HashSet<>();
        pairs.add("responsibility:연간 업무 전체");
        for (Map<String, Object> fact : facts) {
            String task = String.valueOf(fact.get("업무"));
            if (!"완료".equals(fact.get("진행상태"))) {
                pairs.add("plan:" + task);
            }
            if (fact.containsKey("일정변경")) {
                pairs.add("issue:" + task);
            }
            if (Boolean.TRUE.equals(fact.get("인계시점이후종료"))) {
                pairs.add("pending:" + task);
            }
        }
        return pairs;
    }

    private List<DraftResponse.DraftItem> readDrafts(
            JsonNode answer, Set<String> taskNames, Set<String> eligiblePairs) {
        List<DraftResponse.DraftItem> drafts = new ArrayList<>();
        Set<String> acceptedPairs = new java.util.HashSet<>();
        for (JsonNode item : answer.path("drafts")) {
            if (drafts.size() >= MAX_DRAFTS) {
                break;
            }
            String category = item.path("category").asText("");
            String title = item.path("title").asText("").trim();
            String proposedSourceTask = item.path("sourceTask").asText("").trim();
            List<String> paragraphs = AiSupport.trimmedLines(ModelJson.strings(item.path("paragraphs")), Integer.MAX_VALUE);
            if (!schema.isCategory(category) || title.isEmpty() || !item.path("paragraphs").isArray()
                    || item.path("paragraphs").isEmpty()) {
                continue;
            }
            if (!"responsibility".equals(category) && !taskNames.contains(proposedSourceTask)) {
                continue;
            }
            String sourceTask = "responsibility".equals(category) ? "연간 업무 전체" : proposedSourceTask;
            String pair = category + ":" + sourceTask;
            if (!eligiblePairs.contains(pair) || !acceptedPairs.add(pair)) {
                continue;
            }

            List<String> questions = AiSupport.trimmedLines(ModelJson.strings(item.path("questions")), MAX_QUESTIONS);
            drafts.add(new DraftResponse.DraftItem(
                    "draft-" + drafts.size(),
                    category,
                    AiSupport.clip(AiSupport.stripExtractionMarkup(title), TITLE_MAX),
                    AiSupport.detailHtml(
                            paragraphs.stream().map(AiSupport::stripExtractionMarkup).toList(), questions),
                    support.cleanProperties(category, ModelJson.propertyPairs(item.path("properties")), inferableKeys::contains),
                    "record".equals(item.path("basis").asText("")) ? "record" : "inferred",
                    questions,
                    sourceTask));
        }
        return drafts;
    }
}
