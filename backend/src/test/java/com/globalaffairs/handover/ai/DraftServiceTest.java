package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.ai.dto.DraftResponse;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.member.CustomTeamRepository;
import com.globalaffairs.handover.schedule.CustomTaskRepository;
import com.globalaffairs.handover.schedule.RemovedTaskRepository;
import com.globalaffairs.handover.schedule.TaskReschedule;
import com.globalaffairs.handover.schedule.TaskPeriodRepository;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import com.globalaffairs.handover.schedule.WorkspacePlan;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;

/**
 * What reaches the model, and what survives coming back. The prompt is assembled from records only,
 * so these cases pin which facts are allowed to appear in it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DraftServiceTest {

    /** Inside the 2026 academic year: 2026-08-10 is week 21 (8월 2주). */
    private static final Instant NOW = Instant.parse("2026-08-10T00:00:00Z");

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private TaskRescheduleRepository repository;

    @Mock
    private TaskPeriodRepository periods;

    @Mock
    private OpenAiClient openAiClient;

    @Mock
    private CustomTaskRepository customTasks;

    @Mock
    private RemovedTaskRepository removedTasks;

    @Mock
    private CustomMemberRepository customMembers;

    @Mock
    private CustomTeamRepository customTeams;

    private DraftService service;

    @BeforeEach
    void setUp() {
        OrgData orgData = new OrgData(objectMapper);
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);
        service = new DraftService(
                orgData,
                new WorkspacePlan(orgData, customTasks, removedTasks, customMembers, customTeams),
                schema,
                calendar,
                repository,
                periods,
                openAiClient,
                new AiResources(objectMapper, schema, calendar),
                new AiSupport(schema),
                new JsonStringify(objectMapper),
                new DraftProperties(null),
                Clock.fixed(NOW, ZoneOffset.UTC));
        when(repository.findByPersonIdOrderByIdAsc(anyString())).thenReturn(List.of());
    }

    private void modelAnswers(String json) {
        try {
            when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                    .thenReturn(objectMapper.readTree(json));
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private String promptSentToModel() {
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(openAiClient)
                .ask(anyString(), anyString(), any(), anyString(), user.capture());
        return user.getValue();
    }

    @Test
    void refusesAPersonTheOrgChartDoesNotKnow() {
        assertThatThrownBy(() -> service.draft("nobody"))
                .isInstanceOf(ApiException.class)
                .hasMessage("담당자를 찾을 수 없습니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void refusesADateOutsideTheAcademicYear() {
        OrgData orgData = new OrgData(objectMapper);
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);
        DraftService outsideYear = new DraftService(
                orgData,
                new WorkspacePlan(orgData, customTasks, removedTasks, customMembers, customTeams),
                schema,
                calendar,
                repository,
                periods,
                openAiClient,
                new AiResources(objectMapper, schema, calendar),
                new AiSupport(schema),
                new JsonStringify(objectMapper),
                new DraftProperties(null),
                Clock.fixed(Instant.parse("2027-06-01T00:00:00Z"), ZoneOffset.UTC));

        assertThatThrownBy(() -> outsideYear.draft("minseo"))
                .hasMessage("2026학년도 기간에만 초안을 만들 수 있습니다.");
    }

    @Test
    void answersFiveOhThreeWhenTheFeatureIsNotConfigured() {
        doThrow(ApiException.unavailable("AI 초안 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요."))
                .when(openAiClient).requireConfigured(anyString());

        assertThatThrownBy(() -> service.draft("minseo"))
                .isInstanceOf(ApiException.class)
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void tellsTheModelWhichTasksAreDoneRunningAndUpcomingAsOfToday() {
        modelAnswers("{\"drafts\":[]}");

        service.draft("minseo");

        String prompt = promptSentToModel();
        assertThat(prompt).contains("\"오늘\": \"8월 2주\"");
        /* 신입생 체류자격 변경 ran weeks 0-3, so by week 21 it is finished. */
        assertThat(prompt).contains("\"업무\": \"신입생 체류자격 변경\"").contains("\"진행상태\": \"완료\"");
        /* 비자 연장 집중기간 starts at week 21 and runs five weeks: it is in its first week today. */
        assertThat(prompt).contains("\"경과\": \"5주 중 1주차\"").contains("\"인계시점이후종료\": true");
        assertThat(prompt).contains("\"진행상태\": \"예정\"");
    }

    @Test
    void appliesTheLatestRecordedMoveBeforeDecidingATasksPhase() {
        when(repository.findByPersonIdOrderByIdAsc("minseo")).thenReturn(List.of(
                reschedule("비자 연장 집중기간", 21, 30, "1차 연기"),
                reschedule("비자 연장 집중기간", 30, 40, "2차 연기")));
        modelAnswers("{\"drafts\":[]}");

        service.draft("minseo");

        String prompt = promptSentToModel();
        /* The latest move wins: the task now starts at week 40 and reads as upcoming, not active. */
        assertThat(prompt).contains("\"기간\": \"1월 1주 ~ 2월 1주\"");
        assertThat(prompt).doesNotContain("\"인계시점이후종료\"");
        /* The whole trail travels with it, so the model can cite the reasons. */
        assertThat(prompt).contains("1차 연기").contains("2차 연기");
    }

    @Test
    void onlyOffersTheModelTheJudgementPropertiesItIsAllowedToInfer() {
        modelAnswers("{\"drafts\":[]}");

        service.draft("minseo");

        String prompt = promptSentToModel();
        assertThat(prompt).contains("\"key\": \"importance\"").contains("\"key\": \"impact\"");
        /* A due date or a partner department is a fact, not a judgement: it stays out. */
        assertThat(prompt).doesNotContain("\"key\": \"due\"").doesNotContain("\"key\": \"department\"");
    }

    @Test
    void buildsEachDraftFromEscapedModelTextAndCapsItsQuestions() {
        modelAnswers("""
                {"drafts":[{
                  "category":"plan","title":"  2학기 비자 연장 접수  ",
                  "paragraphs":["첫 문단입니다.","<b>두 번째</b> 문단입니다."],
                  "properties":[{"key":"impact","value":"높음"},{"key":"due","value":"2026. 09. 06"}],
                  "basis":"record",
                  "questions":["질문1","질문2","질문3","질문4"],
                  "sourceTask":"비자 연장 집중기간"
                }]}""");

        DraftResponse response = service.draft("minseo");

        assertThat(response.person().name()).isEqualTo("박민서");
        assertThat(response.person().team()).isEqualTo("유학생관리");
        assertThat(response.todayLabel()).isEqualTo("8월 2주");
        assertThat(response.drafts()).hasSize(1);

        DraftResponse.DraftItem item = response.drafts().get(0);
        assertThat(item.id()).isEqualTo("draft-0");
        assertThat(item.title()).isEqualTo("2학기 비자 연장 접수");
        assertThat(item.detail()).contains("&lt;b&gt;두 번째&lt;/b&gt;").doesNotContain("<b>두");
        assertThat(item.questions()).containsExactly("질문1", "질문2", "질문3");
        /* `impact` is not a `plan` field and `due` is a fact, so neither survives. */
        assertThat(item.properties()).isEmpty();
        assertThat(item.basis()).isEqualTo("record");
        assertThat(item.sourceTask()).isEqualTo("비자 연장 집중기간");
    }

    @Test
    void keepsADraftWhoseTaskNameOnlyDiffersInSpacing() {
        modelAnswers("""
                {"drafts":[{
                  "category":"plan","title":"2학기 비자 연장 접수",
                  "paragraphs":["첫 문단입니다."],
                  "properties":[],
                  "basis":"record",
                  "questions":[],
                  "sourceTask":"비자연장 집중기간"
                }]}""");

        DraftResponse response = service.draft("minseo");

        assertThat(response.drafts()).hasSize(1);
        /* The card still names the task the way the year view does, not the way the model wrote it. */
        assertThat(response.drafts().get(0).sourceTask()).isEqualTo("비자 연장 집중기간");
    }

    @Test
    void dropsADraftAboutWorkTheCalendarDoesNotRecord() {
        modelAnswers("""
                {"drafts":[{
                  "category":"plan","title":"신규 업무 초안",
                  "paragraphs":["첫 문단입니다."],
                  "properties":[],
                  "basis":"record",
                  "questions":[],
                  "sourceTask":"비자 연장 접수"
                }]}""");

        assertThat(service.draft("minseo").drafts()).isEmpty();
    }

    @Test
    void keepsOnlyTheJudgementPropertyThatBelongsToTheItemsOwnSection() {
        when(repository.findByPersonIdOrderByIdAsc("minseo")).thenReturn(List.of(
                reschedule("비자 연장 집중기간", 21, 22, "접수 일정 조정")));
        modelAnswers("""
                {"drafts":[{
                  "category":"issue","title":"현안","paragraphs":["본문"],
                  "properties":[{"key":"impact","value":"긴급"},{"key":"department","value":"출입국관리사무소"}],
                  "basis":"inferred","questions":[],"sourceTask":"비자 연장 집중기간"
                }]}""");

        assertThat(service.draft("minseo").drafts().get(0).properties())
                .containsExactlyEntriesOf(java.util.Map.of("impact", "긴급"));
    }

    @Test
    void dropsAnItemWhoseSectionOrBodyTheEditorCouldNotRender() {
        modelAnswers("""
                {"drafts":[
                  {"category":"unknown","title":"제목","paragraphs":["본문"],"properties":[],"basis":"record","questions":[],"sourceTask":"x"},
                  {"category":"plan","title":"   ","paragraphs":["본문"],"properties":[],"basis":"record","questions":[],"sourceTask":"x"},
                  {"category":"plan","title":"제목","paragraphs":[],"properties":[],"basis":"record","questions":[],"sourceTask":"x"}
                ]}""");

        assertThat(service.draft("minseo").drafts()).isEmpty();
    }

    @Test
    void normalizesTheResponsibilitySourceToTheAnnualWorkScope() {
        modelAnswers("""
                {"drafts":[{"category":"responsibility","title":"담당","paragraphs":["본문"],
                  "properties":[],"basis":"record","questions":[],"sourceTask":"  "}]}""");

        assertThat(service.draft("minseo").drafts().get(0).sourceTask()).isEqualTo("연간 업무 전체");
    }

    @Test
    void treatsAnyBasisOtherThanRecordAsInferred() {
        modelAnswers("""
                {"drafts":[{"category":"plan","title":"제목","paragraphs":["본문"],
                  "properties":[],"basis":"guessed","questions":[],"sourceTask":"비자 연장 집중기간"}]}""");

        assertThat(service.draft("minseo").drafts().get(0).basis()).isEqualTo("inferred");
    }

    @Test
    void dropsDuplicateDraftsForTheSameSectionAndSourceTask() {
        String one = "{\"category\":\"plan\",\"title\":\"제목\",\"paragraphs\":[\"본문\"],"
                + "\"properties\":[],\"basis\":\"record\",\"questions\":[],\"sourceTask\":\"비자 연장 집중기간\"}";
        modelAnswers("{\"drafts\":[" + String.join(",", java.util.Collections.nCopies(20, one)) + "]}");

        assertThat(service.draft("minseo").drafts()).hasSize(1);
    }

    private static TaskReschedule reschedule(String title, int from, int to, String reason) {
        return new TaskReschedule(
                OrgData.taskKey("minseo", title), "minseo", title, from, to, reason, "박민서", NOW);
    }
}
