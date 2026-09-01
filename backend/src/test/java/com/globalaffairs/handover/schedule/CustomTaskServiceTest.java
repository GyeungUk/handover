package com.globalaffairs.handover.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.OrgData;
import com.globalaffairs.handover.member.CustomMemberRepository;
import com.globalaffairs.handover.web.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CustomTaskServiceTest {

    @Mock
    private CustomTaskRepository repository;

    @Mock
    private RemovedTaskRepository removedTasks;

    @Mock
    private TaskRescheduleRepository reschedules;

    @Mock
    private TaskChecklistItemRepository checklistItems;

    @Mock
    private TaskDateRepository taskDates;

    @Mock
    private CustomMemberRepository customMembers;

    private CustomTaskService service;

    @BeforeEach
    void setUp() {
        service = new CustomTaskService(
                repository,
                removedTasks,
                reschedules,
                checklistItems,
                taskDates,
                customMembers,
                new OrgData(new ObjectMapper()),
                Clock.fixed(Instant.parse("2026-08-31T03:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void createsATaskForASeedPersonAndTrimsItsText() {
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        CustomTaskResponse task = service.create(
                "minseo", "  출입국 정기 점검  ", 12, 3, "  대상자 명단 확인  ", "김지현");

        assertThat(task.personId()).isEqualTo("minseo");
        assertThat(task.title()).isEqualTo("출입국 정기 점검");
        assertThat(task.start()).isEqualTo(12);
        assertThat(task.duration()).isEqualTo(3);
        assertThat(task.note()).isEqualTo("대상자 명단 확인");
    }

    @Test
    void refusesAPeriodThatRunsPastTheAcademicYear() {
        assertThatThrownBy(() -> service.create("minseo", "연말 업무", 47, 2, "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("일정 기간이 학년도 안에 있어야 합니다.");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void refusesATitleAlreadyInTheSeedPlan() {
        assertThatThrownBy(() -> service.create(
                        "minseo", "비자 연장 집중기간", 20, 2, "", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("같은 담당자에게 동일한 이름의 일정이 이미 있습니다.");
    }

    @Test
    void freesASeedTitleOnceThatSeedTaskHasBeenDeleted() {
        when(removedTasks.existsById("minseo::비자 연장 집중기간")).thenReturn(true);
        when(repository.existsByPersonIdAndTitle("minseo", "비자 연장 집중기간")).thenReturn(false);
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        CustomTaskResponse task = service.create("minseo", "비자 연장 집중기간", 20, 2, "", "김지현");

        assertThat(task.start()).isEqualTo(20);
    }

    @Test
    void deletesAnAuthoredTaskAsARowAndClearsWhatHungOffIt() {
        when(repository.findByPersonIdAndTitle("minseo", "출입국 정기 점검"))
                .thenReturn(Optional.of(new CustomTask(
                        "minseo", "출입국 정기 점검", 12, 3, "", "김지현", Instant.parse("2026-08-31T03:00:00Z"))));

        service.delete("minseo", "  출입국 정기 점검  ", "김지현");

        verify(repository).delete(any());
        verify(removedTasks, never()).save(any());
        verify(reschedules).deleteByTaskKey("minseo::출입국 정기 점검");
        verify(checklistItems).deleteByTaskKey("minseo::출입국 정기 점검");
        verify(taskDates).deleteByTaskKey("minseo::출입국 정기 점검");
    }

    @Test
    void tombstonesASeedTaskBecauseThereIsNoRowToDelete() {
        when(repository.findByPersonIdAndTitle("minseo", "비자 연장 집중기간")).thenReturn(Optional.empty());
        when(removedTasks.existsById("minseo::비자 연장 집중기간")).thenReturn(false);

        service.delete("minseo", "비자 연장 집중기간", "김지현");

        ArgumentCaptor<RemovedTask> saved = ArgumentCaptor.forClass(RemovedTask.class);
        verify(removedTasks).save(saved.capture());
        assertThat(saved.getValue().getTaskKey()).isEqualTo("minseo::비자 연장 집중기간");
        assertThat(saved.getValue().getRemovedBy()).isEqualTo("김지현");
        verify(reschedules).deleteByTaskKey("minseo::비자 연장 집중기간");
        verify(taskDates).deleteByTaskKey("minseo::비자 연장 집중기간");
    }

    @Test
    void refusesToDeleteATaskThatIsAlreadyGone() {
        when(repository.findByPersonIdAndTitle("minseo", "비자 연장 집중기간")).thenReturn(Optional.empty());
        when(removedTasks.existsById("minseo::비자 연장 집중기간")).thenReturn(true);

        assertThatThrownBy(() -> service.delete("minseo", "비자 연장 집중기간", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
        verify(reschedules, never()).deleteByTaskKey(any());
    }

    @Test
    void refusesToDeleteATaskNobodyEverHad() {
        assertThatThrownBy(() -> service.delete("minseo", "없는 일정", "김지현"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }
}
