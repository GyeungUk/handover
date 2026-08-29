package com.globalaffairs.handover.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The org chart port must answer exactly what {@code app/org-data.ts} answered. */
class OrgDataTest {

    private final OrgData orgData = new OrgData(new ObjectMapper());

    @Test
    void loadsEveryTeamAndPersonFromTheExportedSeedData() {
        assertThat(orgData.teams()).hasSize(4);
        assertThat(orgData.teams().stream().flatMap(team -> team.people().stream()).toList()).hasSize(12);
        assertThat(orgData.teams().stream()
                        .flatMap(team -> team.people().stream())
                        .flatMap(person -> person.tasks().stream()))
                .hasSize(48)
                .allSatisfy(task -> assertThat(task.start() + task.duration()).isLessThanOrEqualTo(OrgData.WEEKS_IN_YEAR));
    }

    @Test
    void keepsTheKoreanFieldsThatOnlyExistOnTheTypeScriptSide() {
        Team management = orgData.teams().get(0);
        assertThat(management.id()).isEqualTo("management");
        assertThat(management.title()).isEqualTo("유학생관리");
        /* `short` is a reserved word in Java; the binding must still pick it up. */
        assertThat(management.shortName()).isEqualTo("유학생관리");
        assertThat(management.english()).isEqualTo("STUDENT CARE");
    }

    @Test
    void labelsAWeekTheWayTheWorkspaceDoes() {
        assertThat(orgData.weekLabel(0)).isEqualTo("3월 1주");
        assertThat(orgData.weekLabel(5)).isEqualTo("4월 2주");
        assertThat(orgData.weekLabel(40)).isEqualTo("1월 1주");
        assertThat(orgData.weekLabel(47)).isEqualTo("2월 4주");
    }

    @Test
    void labelsATaskPeriodInclusiveOfBothEnds() {
        Task task = new Task("비자 연장 집중기간", 21, 5, "", null);
        assertThat(orgData.taskPeriodLabel(task)).isEqualTo("8월 2주 ~ 9월 2주");
    }

    @Test
    void placesATaskRelativeToToday() {
        Task task = new Task("샘플", 10, 4, "", null);
        assertThat(OrgData.taskPhase(task, 9)).isEqualTo(TaskPhase.UPCOMING);
        assertThat(OrgData.taskPhase(task, 10)).isEqualTo(TaskPhase.ACTIVE);
        assertThat(OrgData.taskPhase(task, 13)).isEqualTo(TaskPhase.ACTIVE);
        assertThat(OrgData.taskPhase(task, 14)).isEqualTo(TaskPhase.DONE);
    }

    @Test
    void findsPeopleAndTheirSeedTasksByIdOnly() {
        assertThat(orgData.findPerson("minseo")).isPresent();
        assertThat(orgData.findPerson("nobody")).isEmpty();
        assertThat(orgData.findPerson(null)).isEmpty();
        assertThat(orgData.findSeedTask("minseo", "신입생 체류자격 변경")).get()
                .extracting(Task::start, Task::duration)
                .isEqualTo(List.of(0, 4));
        assertThat(orgData.findSeedTask("minseo", "존재하지 않는 업무")).isEmpty();
    }

    @Test
    void readsTheStartingMonthFromTheMonthLabelsRatherThanAssumingMarch() {
        assertThat(orgData.startMonth()).isEqualTo(3);
        assertThat(orgData.months()).hasSize(12).startsWith("3월").endsWith("2월");
    }

    @Test
    void buildsTheStableTaskKeyTheHistoryIsGroupedBy() {
        assertThat(OrgData.taskKey("minseo", "비자 연장 집중기간")).isEqualTo("minseo::비자 연장 집중기간");
    }

    @Test
    void treatsTheTwelveSeedIdsAsTheOnlyValidMembers() {
        assertThat(orgData.isKnownPerson("dohyun")).isTrue();
        assertThat(orgData.isKnownPerson("someone-else")).isFalse();
    }
}
