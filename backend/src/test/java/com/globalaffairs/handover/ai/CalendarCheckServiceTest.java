package com.globalaffairs.handover.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.ai.dto.AlignmentResponse;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.HandoverSchema;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.member.CustomTeamRepository;
import com.globalaffairs.handover.schedule.CustomTaskRepository;
import com.globalaffairs.handover.schedule.RemovedTaskRepository;
import com.globalaffairs.handover.schedule.TaskPeriodRepository;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import com.globalaffairs.handover.schedule.WorkspacePlan;
import com.globalaffairs.handover.web.ApiException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * A proposal may only move a task as far as the anchor it cites actually moved. Everything else is
 * downgraded to "담당자 확인 필요" so nothing unfounded is offered as a one-click move.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CalendarCheckServiceTest {

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

    private CalendarCheckService service;

    @BeforeEach
    void setUp() {
        OrgData orgData = new OrgData(objectMapper);
        HandoverSchema schema = new HandoverSchema(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);
        service = new CalendarCheckService(
                orgData,
                new WorkspacePlan(orgData, customTasks, removedTasks, customMembers, customTeams),
                calendar,
                repository,
                periods,
                openAiClient,
                new AiResources(objectMapper, schema, calendar));
        when(repository.findByPersonIdOrderByIdAsc(anyString())).thenReturn(List.of());
        when(customTasks.findByPersonIdOrderByStartAscIdAsc(anyString())).thenReturn(List.of());
        when(removedTasks.existsById(anyString())).thenReturn(false);
    }

    private void modelAnswers(String json) {
        try {
            when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                    .thenReturn(objectMapper.readTree(json));
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static AlignmentResponse.AlignmentItem itemFor(AlignmentResponse response, String taskTitle) {
        return response.items().stream()
                .filter(item -> item.taskTitle().equals(taskTitle))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void refusesAPersonTheOrgChartDoesNotKnow() {
        assertThatThrownBy(() -> service.check("nobody", 2027)).hasMessage("담당자를 찾을 수 없습니다.");
    }

    @Test
    void refusesAYearThereIsNothingToCompareAgainst() {
        assertThatThrownBy(() -> service.check("minseo", 2026))
                .isInstanceOf(ApiException.class)
                .hasMessage("비교할 학사일정이 없는 학년도입니다.");
        assertThatThrownBy(() -> service.check("minseo", 2030)).hasMessage("비교할 학사일정이 없는 학년도입니다.");
        assertThatThrownBy(() -> service.check("minseo", null)).hasMessage("비교할 학사일정이 없는 학년도입니다.");
    }

    @Test
    void acceptsAMoveThatMatchesTheAnchorItCites() {
        modelAnswers("""
                {"items":[{"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":1,
                  "anchorEvent":"입학식·1학기 개강","reason":"개강이 한 주 늦어졌습니다.","note":"","evidenceQuote":"신입생 체류자격 변경"}]}""");

        AlignmentResponse response = service.check("minseo", 2027);

        AlignmentResponse.AlignmentItem item = itemFor(response, "신입생 체류자격 변경");
        assertThat(item.action()).isEqualTo("shift");
        assertThat(item.currentStart()).isZero();
        assertThat(item.suggestedStart()).isEqualTo(1);
        assertThat(item.currentLabel()).isEqualTo("3월 1주");
        assertThat(item.suggestedLabel()).isEqualTo("3월 2주");
        assertThat(item.anchorEvent()).isEqualTo("입학식·1학기 개강");
        assertThat(item.anchorLabel()).isEqualTo("3월 1주 → 3월 2주");
        assertThat(item.anchorShift()).isEqualTo(1);
        assertThat(response.actionLabels()).containsEntry("shift", "일정 조정 제안");
        assertThat(response.fromYear()).isEqualTo(2026);
        assertThat(response.toYear()).isEqualTo(2027);
        assertThat(response.shifts()).isNotEmpty();
    }

    @Test
    void keepsTheTaskWhenAShiftHasNoVerbatimTaskEvidence() {
        modelAnswers("""
                {"items":[{"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":1,
                  "anchorEvent":"입학식·1학기 개강","reason":"개강에 맞춥니다.","note":"","evidenceQuote":"원문에 없는 근거"}]}""");

        assertThat(itemFor(service.check("minseo", 2027), "신입생 체류자격 변경").action()).isEqualTo("keep");
    }

    @Test
    void fallsBackToACompleteLocalComparisonWhenTheExternalCallFails() {
        when(openAiClient.ask(anyString(), anyString(), any(), anyString(), anyString()))
                .thenThrow(ApiException.badGateway("upstream failed"));

        AlignmentResponse response = service.check("minseo", 2027);

        assertThat(response.notice()).contains("외부 분석 연결 없이");
        assertThat(response.shifts()).isNotEmpty();
        assertThat(response.items()).hasSize(4).allSatisfy(item -> {
            assertThat(item.action()).isEqualTo("keep");
            assertThat(item.suggestedStart()).isEqualTo(item.currentStart());
        });
    }

    @Test
    void downgradesAMoveThatOutrunsItsAnchor() {
        modelAnswers("""
                {"items":[{"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":3,
                  "anchorEvent":"입학식·1학기 개강","reason":"더 옮기겠습니다.","note":"확인 필요","evidenceQuote":"신입생 체류자격 변경"}]}""");

        AlignmentResponse.AlignmentItem item = itemFor(service.check("minseo", 2027), "신입생 체류자격 변경");
        assertThat(item.action()).isEqualTo("review");
        /* The reasoning still reaches the author, but the task keeps its slot. */
        assertThat(item.suggestedStart()).isEqualTo(item.currentStart());
        assertThat(item.reason()).isEqualTo("더 옮기겠습니다.");
        assertThat(item.note()).isEqualTo("확인 필요");
    }

    @Test
    void downgradesAMoveWithNoAnchorAtAll() {
        modelAnswers("""
                {"items":[{"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":1,
                  "anchorEvent":"","reason":"그냥 옮기겠습니다.","note":"","evidenceQuote":"신입생 체류자격 변경"}]}""");

        assertThat(itemFor(service.check("minseo", 2027), "신입생 체류자격 변경").action()).isEqualTo("review");
    }

    @Test
    void ignoresAnAnchorTheTargetCalendarDoesNotPublish() {
        modelAnswers("""
                {"items":[{"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":1,
                  "anchorEvent":"지어낸 학사일정","reason":"이유입니다.","note":"","evidenceQuote":"신입생 체류자격 변경"}]}""");

        AlignmentResponse.AlignmentItem item = itemFor(service.check("minseo", 2027), "신입생 체류자격 변경");
        assertThat(item.action()).isEqualTo("review");
        assertThat(item.anchorEvent()).isEmpty();
        assertThat(item.anchorLabel()).isEmpty();
        assertThat(item.anchorShift()).isZero();
    }

    @Test
    void leavesEveryTaskTheModelSkippedInPlaceRatherThanDroppingIt() {
        modelAnswers("{\"items\":[]}");

        AlignmentResponse response = service.check("minseo", 2027);

        assertThat(response.items()).hasSize(4);
        assertThat(response.items()).allSatisfy(item -> {
            assertThat(item.action()).isEqualTo("keep");
            assertThat(item.suggestedStart()).isEqualTo(item.currentStart());
            assertThat(item.reason()).isEqualTo("학사일정 변동의 영향이 확인되지 않아 현재 일정을 유지합니다.");
        });
    }

    @Test
    void ignoresAProposalAboutATaskThatIsNotInThePlan() {
        modelAnswers("""
                {"items":[{"taskTitle":"없는 업무","action":"shift","shiftWeeks":1,
                  "anchorEvent":"입학식·1학기 개강","reason":"이유입니다.","note":""}]}""");

        assertThat(service.check("minseo", 2027).items())
                .extracting(AlignmentResponse.AlignmentItem::taskTitle)
                .doesNotContain("없는 업무");
    }

    @Test
    void listsProposalsFirstThenReviewsThenUntouchedTasks() {
        modelAnswers("""
                {"items":[
                  {"taskTitle":"동계 체류 현황 점검","action":"keep","shiftWeeks":0,"anchorEvent":"","reason":"r","note":"","evidenceQuote":""},
                  {"taskTitle":"외국인등록 단체접수","action":"review","shiftWeeks":0,"anchorEvent":"","reason":"r","note":"","evidenceQuote":"외국인등록 단체접수"},
                  {"taskTitle":"신입생 체류자격 변경","action":"shift","shiftWeeks":1,"anchorEvent":"입학식·1학기 개강","reason":"r","note":"","evidenceQuote":"신입생 체류자격 변경"}
                ]}""");

        assertThat(service.check("minseo", 2027).items())
                .extracting(AlignmentResponse.AlignmentItem::action)
                .containsExactly("shift", "review", "keep", "keep");
    }
}
