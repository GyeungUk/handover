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
import com.globalaffairs.handover.domain.DateSpan;
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
 * The seed task these cases lean on is 박민서's 비자 연장 집중기간: 8월 2주 for five weeks, which is week
 * slots 21 to 25 and so the days 2026-08-08 to 2026-09-14 while it is planned in weeks alone.
 */
@ExtendWith(MockitoExtension.class)
class TaskPeriodServiceTest {

    private static final String KEY = "minseo::비자 연장 집중기간";
    private static final Instant NOW = Instant.parse("2026-08-31T03:00:00Z");

    @Mock
    private TaskPeriodRepository repository;

    @Mock
    private TaskDateRepository taskDates;

    @Mock
    private CustomTaskRepository customTasks;

    @Mock
    private RemovedTaskRepository removedTasks;

    private TaskPeriodService service;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        OrgData orgData = new OrgData(objectMapper);
        AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);
        WorkspacePlan plan = new WorkspacePlan(
                orgData,
                customTasks,
                removedTasks,
                mock(CustomMemberRepository.class),
                mock(CustomTeamRepository.class));
        service = new TaskPeriodService(
                repository, taskDates, plan, calendar, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private void savesWhateverItIsGiven() {
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void fixesATaskToRealDatesAndPlacesItOnTheSlotsThoseDatesFallIn() {
        savesWhateverItIsGiven();

        /* 9월 14일 is the 9월 2주 slot and 9월 18일 the 9월 3주 one, so the task occupies two. */
        TaskPeriodResponse saved =
                service.set("minseo", "비자 연장 집중기간", "2026-09-14", "2026-09-18", "김지현");

        assertThat(saved.taskKey()).isEqualTo(KEY);
        assertThat(saved.startsOn()).isEqualTo("2026-09-14");
        assertThat(saved.endsOn()).isEqualTo("2026-09-18");
        assertThat(saved.startWeek()).isEqualTo(25);
        assertThat(saved.duration()).isEqualTo(2);
        assertThat(saved.setBy()).isEqualTo("김지현");
    }

    @Test
    void countsAPeriodInsideOneSlotAsOneSlotLongBecauseTheTrackCannotDrawLess() {
        savesWhateverItIsGiven();

        assertThat(service.set("minseo", "비자 연장 집중기간", "2026-09-08", "2026-09-10", "김지현").duration())
                .isEqualTo(1);
    }

    @Test
    void acceptsAPeriodOfASingleDay() {
        savesWhateverItIsGiven();

        TaskPeriodResponse saved =
                service.set("minseo", "비자 연장 집중기간", "2026-09-03", "2026-09-03", "김지현");

        assertThat(saved.startsOn()).isEqualTo("2026-09-03");
        assertThat(saved.endsOn()).isEqualTo("2026-09-03");
        assertThat(saved.duration()).isEqualTo(1);
    }

    @Test
    void movesAnExistingPeriodInPlaceRatherThanReplacingTheRow() {
        TaskPeriod existing = new TaskPeriod(
                KEY, "minseo", "비자 연장 집중기간",
                LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18), "박민서", NOW);
        when(repository.findById(KEY)).thenReturn(Optional.of(existing));
        savesWhateverItIsGiven();

        TaskPeriodResponse moved =
                service.set("minseo", "비자 연장 집중기간", "2026-09-21", "2026-09-25", "김지현");

        assertThat(existing.getStartsOn()).isEqualTo(LocalDate.of(2026, 9, 21));
        assertThat(existing.getEndsOn()).isEqualTo(LocalDate.of(2026, 9, 25));
        assertThat(existing.getSetBy()).isEqualTo("김지현");
        assertThat(moved.taskKey()).isEqualTo(KEY);
        assertThat(moved.startWeek()).isEqualTo(26);
    }

    @Test
    void refusesAPeriodThatEndsBeforeItStarts() {
        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "2026-09-18", "2026-09-14", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("종료일이 시작일보다 빠를 수 없습니다.");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void refusesAPeriodOutsideTheAcademicYearAndSaysWhichWindowIsOpen() {
        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "2027-03-02", "2027-03-06", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 기간은 2026학년도(2026-03-01 ~ 2027-02-28) 안에 있어야 합니다.");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void refusesAPeriodWithAMissingOrUnreadableEnd() {
        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "2026-09-14", "  ", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "9월 14일", "2026-09-18", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정 기간의 시작일과 종료일을 모두 선택해 주세요.");
    }

    /**
     * A confirmed day the new period no longer covers would be one the month grid can draw nowhere,
     * so the move is refused and the day at fault is named — that is the only thing the author can
     * act on.
     */
    @Test
    void refusesAPeriodThatWouldStrandAConfirmedDay() {
        when(taskDates.findByTaskKeyOrderByDateAscIdAsc(KEY))
                .thenReturn(List.of(new TaskDate(
                        KEY, "minseo", "비자 연장 집중기간",
                        LocalDate.of(2026, 8, 20), "단체접수 1차", "김지현", NOW)));

        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "2026-09-14", "2026-09-18", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("이미 등록된 확정 일자 2026-08-20이(가) 새 기간을 벗어납니다. 해당 일자를 먼저 정리해 주세요.");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void keepsAPeriodThatStillCoversEveryConfirmedDay() {
        when(taskDates.findByTaskKeyOrderByDateAscIdAsc(KEY))
                .thenReturn(List.of(new TaskDate(
                        KEY, "minseo", "비자 연장 집중기간",
                        LocalDate.of(2026, 8, 20), "단체접수 1차", "김지현", NOW)));
        savesWhateverItIsGiven();

        assertThat(service.set("minseo", "비자 연장 집중기간", "2026-08-17", "2026-08-28", "김지현").startsOn())
                .isEqualTo("2026-08-17");
    }

    @Test
    void refusesAPeriodOnATaskNobodyHas() {
        assertThatThrownBy(() -> service.set("minseo", "없는 일정", "2026-09-14", "2026-09-18", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }

    @Test
    void refusesAPeriodOnASeedTaskThatWasDeleted() {
        when(removedTasks.existsById(KEY)).thenReturn(true);

        assertThatThrownBy(() -> service.set("minseo", "비자 연장 집중기간", "2026-09-14", "2026-09-18", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }

    /**
     * The week slots never stopped being the task's own — the period only outranked them — so
     * clearing is the whole of the change and there is nothing to recompute on the way out.
     */
    @Test
    void clearingAPeriodReturnsTheTaskToItsWeekSlots() {
        TaskPeriod existing = new TaskPeriod(
                KEY, "minseo", "비자 연장 집중기간",
                LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18), "박민서", NOW);
        when(repository.findById(KEY)).thenReturn(Optional.of(existing));

        service.clear("minseo", "비자 연장 집중기간");

        verify(repository).delete(existing);
    }

    @Test
    void refusesToClearAPeriodTheTaskDoesNotHave() {
        assertThatThrownBy(() -> service.clear("minseo", "비자 연장 집중기간"))
                .isInstanceOf(ApiException.class)
                .hasMessage("확정된 기간이 없는 업무입니다.");
    }

    @Test
    void refusesToClearWithoutATaskToClear() {
        assertThatThrownBy(() -> service.clear("", "비자 연장 집중기간"))
                .isInstanceOf(ApiException.class)
                .hasMessage("유효한 업무 정보가 필요합니다.");
    }

    @Test
    void spanOfAnswersWithTheFixedPeriodWhenThereIsOne() {
        when(repository.findById(KEY))
                .thenReturn(Optional.of(new TaskPeriod(
                        KEY, "minseo", "비자 연장 집중기간",
                        LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18), "박민서", NOW)));

        assertThat(service.spanOf(KEY, 21, 5))
                .isEqualTo(new DateSpan(LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18)));
    }

    @Test
    void spanOfFallsBackToTheDaysTheWeekSlotsStandFor() {
        assertThat(service.spanOf(KEY, 21, 5))
                .isEqualTo(new DateSpan(LocalDate.of(2026, 8, 8), LocalDate.of(2026, 9, 14)));
    }

    @Test
    void listsEveryFixedPeriodWithTheSlotsItsDatesFallOn() {
        when(repository.findAllByOrderByStartsOnAscTaskKeyAsc())
                .thenReturn(List.of(new TaskPeriod(
                        KEY, "minseo", "비자 연장 집중기간",
                        LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 18), "박민서", NOW)));

        assertThat(service.periods())
                .singleElement()
                .satisfies(period -> {
                    assertThat(period.taskKey()).isEqualTo(KEY);
                    assertThat(period.startWeek()).isEqualTo(25);
                    assertThat(period.duration()).isEqualTo(2);
                });
    }
}
