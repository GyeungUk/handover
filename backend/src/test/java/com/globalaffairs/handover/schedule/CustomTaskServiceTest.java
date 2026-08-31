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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CustomTaskServiceTest {

    @Mock
    private CustomTaskRepository repository;

    @Mock
    private CustomMemberRepository customMembers;

    private CustomTaskService service;

    @BeforeEach
    void setUp() {
        service = new CustomTaskService(
                repository,
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
}
