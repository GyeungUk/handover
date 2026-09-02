package com.globalaffairs.handover.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.member.CustomTeamRepository;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The seed task these cases lean on is 박민서's 비자 연장 집중기간: 8월 2주 for five weeks, which is
 * week slots 21 to 25 and so the days 2026-08-08 to 2026-09-14.
 */
@ExtendWith(MockitoExtension.class)
class TaskDateServiceTest {

    @Mock
    private TaskDateRepository repository;

    @Mock
    private TaskRescheduleRepository reschedules;

    @Mock
    private CustomTaskRepository customTasks;

    @Mock
    private RemovedTaskRepository removedTasks;

    @Mock
    private TaskPeriodRepository taskPeriods;

    private TaskDateService service;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        OrgData orgData = new OrgData(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);
        Clock clock = Clock.fixed(Instant.parse("2026-08-31T03:00:00Z"), ZoneOffset.UTC);
        WorkspacePlan plan = new WorkspacePlan(
                orgData,
                customTasks,
                removedTasks,
                mock(CustomMemberRepository.class),
                mock(CustomTeamRepository.class));
        service = new TaskDateService(
                repository,
                reschedules,
                new TaskPeriodService(taskPeriods, repository, plan, calendar, clock),
                plan,
                clock);
    }

    @Test
    void recordsADateInsideTheTasksSpanAndTrimsItsLabel() {
        when(repository.saveAllAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        TaskDateResponse saved = service.add(
                "minseo", "비자 연장 집중기간", "2026-08-20", "  단체접수 1차  ", "김지현");

        assertThat(saved.date()).isEqualTo("2026-08-20");
        assertThat(saved.label()).isEqualTo("단체접수 1차");
        assertThat(saved.taskKey()).isEqualTo("minseo::비자 연장 집중기간");
    }

    @Test
    void acceptsTheLastDayOfTheSpanBecauseTheMonthsFinalSlotRunsToTheMonthsEnd() {
        when(repository.saveAllAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.add("minseo", "비자 연장 집중기간", "2026-09-14", "", "김지현").date())
                .isEqualTo("2026-09-14");
    }

    @Test
    void refusesADateOutsideTheSpanAndSaysWhichWindowIsOpen() {
        assertThatThrownBy(() -> service.add("minseo", "비자 연장 집중기간", "2026-09-15", "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 일자는 업무 기간(2026-08-08 ~ 2026-09-14) 안에서 선택해 주세요.");
        verify(repository, never()).saveAllAndFlush(any());
    }

    @Test
    void measuresTheSpanFromWhereTheTaskWasMovedTo() {
        /* Moved four weeks on, so the window is 9월 2주 to 10월 2주 and the old dates fall outside it. */
        when(reschedules.findFirstByTaskKeyOrderByIdDesc("minseo::비자 연장 집중기간"))
                .thenReturn(Optional.of(new TaskReschedule(
                        "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간", 21, 25, "순연",
                        "박민서", Instant.parse("2026-08-29T01:02:03Z"))));
        when(repository.saveAllAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.add("minseo", "비자 연장 집중기간", "2026-10-01", "", "김지현").date())
                .isEqualTo("2026-10-01");
        assertThatThrownBy(() -> service.add("minseo", "비자 연장 집중기간", "2026-08-20", "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 일자는 업무 기간(2026-09-08 ~ 2026-10-14) 안에서 선택해 주세요.");
    }

    @Test
    void refusesADateTheTaskAlreadyCarries() {
        when(repository.existsByTaskKeyAndDate("minseo::비자 연장 집중기간", LocalDate.of(2026, 8, 20)))
                .thenReturn(true);

        assertThatThrownBy(() -> service.add("minseo", "비자 연장 집중기간", "2026-08-20", "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("이미 등록된 일자입니다.");
    }

    @Test
    void refusesADateOnATaskNobodyHas() {
        assertThatThrownBy(() -> service.add("minseo", "없는 일정", "2026-08-20", "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }

    @Test
    void refusesADateOnASeedTaskThatWasDeleted() {
        when(removedTasks.existsById("minseo::비자 연장 집중기간")).thenReturn(true);

        assertThatThrownBy(() -> service.add("minseo", "비자 연장 집중기간", "2026-08-20", "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }

    @Test
    void recordsAWholePastedBatchInOneWrite() {
        when(repository.saveAllAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<TaskDateResponse> saved = service.addAll(
                "minseo",
                "비자 연장 집중기간",
                List.of(
                        new TaskDateService.NewDate("2026-08-20", "단체접수 1차"),
                        new TaskDateService.NewDate("2026-09-03", "단체접수 2차")),
                "김지현");

        assertThat(saved).extracting(TaskDateResponse::date).containsExactly("2026-08-20", "2026-09-03");
        assertThat(saved).extracting(TaskDateResponse::label).containsExactly("단체접수 1차", "단체접수 2차");
    }

    @Test
    void savesNoneOfABatchWhenOneOfItsDaysIsOutsideTheSpan() {
        assertThatThrownBy(() -> service.addAll(
                        "minseo",
                        "비자 연장 집중기간",
                        List.of(
                                new TaskDateService.NewDate("2026-08-20", "단체접수 1차"),
                                new TaskDateService.NewDate("2026-09-20", "늦은 날짜")),
                        "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 일자는 업무 기간(2026-08-08 ~ 2026-09-14) 안에서 선택해 주세요.");
        verify(repository, never()).saveAllAndFlush(any());
    }

    @Test
    void refusesABatchThatRepeatsADayInsideItself() {
        assertThatThrownBy(() -> service.addAll(
                        "minseo",
                        "비자 연장 집중기간",
                        List.of(
                                new TaskDateService.NewDate("2026-08-20", "1차"),
                                new TaskDateService.NewDate("2026-08-20", "다시 1차")),
                        "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("이미 등록된 일자입니다: 2026-08-20");
        verify(repository, never()).saveAllAndFlush(any());
    }

    @Test
    void refusesABatchThatWouldOverfillTheTask() {
        when(repository.countByTaskKey("minseo::비자 연장 집중기간")).thenReturn(10L);

        assertThatThrownBy(() -> service.addAll(
                        "minseo",
                        "비자 연장 집중기간",
                        List.of(
                                new TaskDateService.NewDate("2026-08-10", ""),
                                new TaskDateService.NewDate("2026-08-11", ""),
                                new TaskDateService.NewDate("2026-08-12", "")),
                        "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("한 업무에 등록할 수 있는 일자는 12개까지입니다.");
    }

    @Test
    void refusesToRemoveADateThatIsAlreadyGone() {
        assertThatThrownBy(() -> service.delete(4L))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 일자입니다.");
    }
}
