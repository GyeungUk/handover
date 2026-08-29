package com.globalaffairs.handover.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.globalaffairs.handover.domain.Today;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The calendar comparison drives every alignment proposal, so its arithmetic is pinned here. */
class AcademicCalendarTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OrgData orgData = new OrgData(objectMapper);
    private final AcademicCalendar calendar = new AcademicCalendar(objectMapper, orgData);

    @Test
    void publishesBothYearsFromTheExportedCalendar() {
        assertThat(calendar.baseYear()).isEqualTo(2026);
        assertThat(calendar.years()).extracting(AcademicYear::year).containsExactly(2026, 2027);
        assertThat(calendar.findYear(2028)).isEmpty();
        assertThat(calendar.findYear(null)).isEmpty();
    }

    @Test
    void reportsHowFarEachAnchorMoved() {
        List<CalendarShift> shifts = calendar.compare(2026, 2027);
        assertThat(shifts).hasSize(20);

        CalendarShift opening = shifts.stream()
                .filter(shift -> shift.name().equals("입학식·1학기 개강"))
                .findFirst()
                .orElseThrow();
        assertThat(opening.fromWeek()).isZero();
        assertThat(opening.toWeek()).isEqualTo(1);
        assertThat(opening.shift()).isEqualTo(1);
        assertThat(opening.fromLabel()).isEqualTo("3월 1주");
        assertThat(opening.toLabel()).isEqualTo("3월 2주");

        /* 2학기 등록·수강신청 is one of the anchors that moved earlier, not later. */
        assertThat(shifts).anySatisfy(shift -> {
            assertThat(shift.name()).isEqualTo("2학기 등록·수강신청");
            assertThat(shift.shift()).isEqualTo(-1);
        });
        /* 2학기 개강 did not move at all. */
        assertThat(shifts).anySatisfy(shift -> {
            assertThat(shift.name()).isEqualTo("2학기 개강");
            assertThat(shift.shift()).isZero();
        });
    }

    @Test
    void returnsNoShiftsForAYearItDoesNotPublish() {
        assertThat(calendar.compare(2026, 2030)).isEmpty();
    }

    @Test
    void derivesTheAcademicYearWindowFromTheDataRatherThanAPinnedDate() {
        assertThat(calendar.startsOn()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(calendar.endsBefore()).isEqualTo(LocalDate.of(2027, 3, 1));
        assertThat(calendar.baseYearLabel()).isEqualTo("2026학년도");
    }

    @Test
    void locatesTodayInsideTheAcademicYearAndNowhereElse() {
        assertThat(calendar.locateToday(LocalDate.of(2026, 3, 1)).week()).isZero();
        assertThat(calendar.locateToday(LocalDate.of(2026, 3, 8)).week()).isEqualTo(1);
        /* The fourth slot absorbs the tail of a long month: 29th-31st stay in week 4. */
        assertThat(calendar.locateToday(LocalDate.of(2026, 3, 31)).week()).isEqualTo(3);
        assertThat(calendar.locateToday(LocalDate.of(2026, 8, 10)).week()).isEqualTo(21);
        assertThat(calendar.locateToday(LocalDate.of(2027, 2, 28)).week()).isEqualTo(47);

        assertThat(calendar.locateToday(LocalDate.of(2026, 2, 28))).isEqualTo(Today.NONE);
        assertThat(calendar.locateToday(LocalDate.of(2027, 3, 1))).isEqualTo(Today.NONE);
    }

    @Test
    void publishesTheAlignmentLabelsInTheOrderTheSourceDeclaresThem() {
        assertThat(calendar.alignmentActionLabels())
                .containsEntry("shift", "일정 조정 제안")
                .containsEntry("keep", "그대로 진행")
                .containsEntry("review", "담당자 확인 필요");
        assertThat(calendar.alignmentActions()).containsExactly("shift", "keep", "review");
    }

    @Test
    void describesAShiftTheWayTheComparisonTableReadsIt() {
        assertThat(AcademicCalendar.shiftLabel(0)).isEqualTo("변동 없음");
        assertThat(AcademicCalendar.shiftLabel(2)).isEqualTo("2주 늦어짐");
        assertThat(AcademicCalendar.shiftLabel(-1)).isEqualTo("1주 당겨짐");
    }

    @Test
    void refusesAPlacementThatWouldRunPastTheEndOfTheYear() {
        assertThat(AcademicCalendar.fitsInYear(44, 4)).isTrue();
        assertThat(AcademicCalendar.fitsInYear(45, 4)).isFalse();
        assertThat(AcademicCalendar.fitsInYear(-1, 2)).isFalse();
    }
}
