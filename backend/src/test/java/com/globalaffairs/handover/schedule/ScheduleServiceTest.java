package com.globalaffairs.handover.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.AcademicCalendar;
import com.globalaffairs.handover.domain.OrgData;
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
import org.springframework.http.HttpStatus;

/**
 * The reschedule rules and, just as importantly, the order they are checked in: the workspace shows
 * whichever Korean message comes back first, so a reordering would change what a user reads.
 */
@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-29T01:02:03.456Z");

    @Mock
    private TaskRescheduleRepository repository;

    private ScheduleService service;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        OrgData orgData = new OrgData(objectMapper);
        service = new ScheduleService(
                repository, orgData, new AcademicCalendar(objectMapper, orgData), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void rejectsAMissingPersonOrTaskBeforeAnythingElse() {
        assertThatThrownBy(() -> service.record(null, "비자 연장 집중기간", 20, "사유입니다", "박민서"))
                .isInstanceOf(ApiException.class)
                .hasMessage("유효한 업무 정보가 필요합니다.");
        assertThatThrownBy(() -> service.record("minseo", "  ", 20, "사유입니다", "박민서"))
                .hasMessage("유효한 업무 정보가 필요합니다.");
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsATaskThatIsNotInThatPersonsSeedPlan() {
        assertThatThrownBy(() -> service.record("minseo", "없는 업무", 20, "사유입니다", "박민서"))
                .isInstanceOf(ApiException.class)
                .hasMessage("존재하지 않는 업무입니다.");
    }

    @Test
    void rejectsAWeekTheAcademicYearCannotHold() {
        /* 비자 연장 집중기간 runs five weeks, so it cannot start later than week 43. */
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", 44, "사유입니다", "박민서"))
                .hasMessage("변경할 일정이 2026학년도 안에 있어야 합니다.");
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", -1, "사유입니다", "박민서"))
                .hasMessage("변경할 일정이 2026학년도 안에 있어야 합니다.");
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", null, "사유입니다", "박민서"))
                .hasMessage("변경할 일정이 2026학년도 안에 있어야 합니다.");
    }

    @Test
    void requiresAReasonOfAtLeastTwoCharactersAndAtMostThreeHundred() {
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", 20, " 가 ", "박민서"))
                .hasMessage("일정 변경 사유를 입력해 주세요.");
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", 20, "가".repeat(301), "박민서"))
                .hasMessage("변경 사유는 300자 이내로 입력해 주세요.");
    }

    @Test
    void refusesAMoveThatChangesNothing() {
        when(repository.findFirstByTaskKeyOrderByIdDesc("minseo::비자 연장 집중기간")).thenReturn(Optional.empty());
        /* The seed start is week 21, and no move has been recorded. */
        assertThatThrownBy(() -> service.record("minseo", "비자 연장 집중기간", 21, "사유입니다", "박민서"))
                .isInstanceOf(ApiException.class)
                .hasMessage("현재와 동일한 일정입니다.")
                .extracting(failure -> ((ApiException) failure).status())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void measuresTheMoveFromTheSeedStartWhenNothingHasBeenRecordedYet() {
        when(repository.findFirstByTaskKeyOrderByIdDesc("minseo::비자 연장 집중기간")).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var change = service.record("minseo", "비자 연장 집중기간", 23, "  출입국 일정 변경  ", "박민서");

        assertThat(change.fromStart()).isEqualTo(21);
        assertThat(change.toStart()).isEqualTo(23);
        assertThat(change.reason()).isEqualTo("출입국 일정 변경");
        assertThat(change.taskKey()).isEqualTo("minseo::비자 연장 집중기간");
        assertThat(change.changedBy()).isEqualTo("박민서");
        /* The frontend already receives this exact format from the Worker. */
        assertThat(change.changedAt()).isEqualTo("2026-08-29T01:02:03.456Z");
    }

    @Test
    void measuresTheMoveFromTheLatestRecordedMoveWhenOneExists() {
        when(repository.findFirstByTaskKeyOrderByIdDesc("minseo::비자 연장 집중기간"))
                .thenReturn(Optional.of(new TaskReschedule(
                        "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                        21, 25, "먼저 옮긴 기록", "박민서", NOW)));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var change = service.record("minseo", "비자 연장 집중기간", 27, "다시 옮깁니다", "최지우");

        assertThat(change.fromStart()).isEqualTo(25);
        ArgumentCaptor<TaskReschedule> saved = ArgumentCaptor.forClass(TaskReschedule.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getFromStart()).isEqualTo(25);
        assertThat(saved.getValue().getChangedBy()).isEqualTo("최지우");
    }
}
