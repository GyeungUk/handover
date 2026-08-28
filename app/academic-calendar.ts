/**
 * The university's academic calendar, which shifts by a week or two every year.
 * Business tasks are planned around these anchors, so when the calendar moves the plan has to move
 * with it. Shared by the client workspace and the alignment API route.
 */

import { WEEKS_IN_YEAR, weekLabel } from './org-data';

/** Which part of the year an anchor belongs to. Only used to group the comparison table. */
export type TermPhase = '1학기' | '하계' | '2학기' | '동계';

export type AcademicEvent = {
  /** stable name; the model may only cite anchors by this exact string */
  name: string;
  phase: TermPhase;
  /** first week slot of the event, 0 = 3월 1주 */
  week: number;
};

export type AcademicYear = { year: number; label: string; events: AcademicEvent[] };

const events2026: AcademicEvent[] = [
  { name: '입학식·1학기 개강', phase: '1학기', week: 0 },
  { name: '수강신청 변경·정정', phase: '1학기', week: 1 },
  { name: '등록금 분할납부 마감', phase: '1학기', week: 2 },
  { name: '후기 신입학 원서접수', phase: '1학기', week: 3 },
  { name: '1학기 중간고사', phase: '1학기', week: 7 },
  { name: '학기 중 휴·복학 신청', phase: '1학기', week: 9 },
  { name: '후기 신입학 합격자 발표', phase: '1학기', week: 10 },
  { name: '1학기 기말고사', phase: '1학기', week: 15 },
  { name: '1학기 성적 입력·정정', phase: '하계', week: 16 },
  { name: '하계 계절학기', phase: '하계', week: 17 },
  { name: '2학기 등록·수강신청', phase: '하계', week: 22 },
  { name: '후기 신입생 등록', phase: '하계', week: 22 },
  { name: '2학기 개강', phase: '2학기', week: 24 },
  { name: '2학기 중간고사', phase: '2학기', week: 31 },
  { name: '전기 신입학 원서접수', phase: '2학기', week: 33 },
  { name: '전기 신입학 합격자 발표', phase: '2학기', week: 35 },
  { name: '2학기 기말고사', phase: '2학기', week: 39 },
  { name: '동계 계절학기', phase: '동계', week: 41 },
  { name: '전기 신입생 등록', phase: '동계', week: 43 },
  { name: '졸업사정·학위수여식', phase: '동계', week: 46 },
];

/** The next year's calendar as the university published it: most anchors move by a week. */
const events2027: AcademicEvent[] = [
  { name: '입학식·1학기 개강', phase: '1학기', week: 1 },
  { name: '수강신청 변경·정정', phase: '1학기', week: 2 },
  { name: '등록금 분할납부 마감', phase: '1학기', week: 2 },
  { name: '후기 신입학 원서접수', phase: '1학기', week: 4 },
  { name: '1학기 중간고사', phase: '1학기', week: 8 },
  { name: '학기 중 휴·복학 신청', phase: '1학기', week: 9 },
  { name: '후기 신입학 합격자 발표', phase: '1학기', week: 11 },
  { name: '1학기 기말고사', phase: '1학기', week: 16 },
  { name: '1학기 성적 입력·정정', phase: '하계', week: 17 },
  { name: '하계 계절학기', phase: '하계', week: 17 },
  { name: '2학기 등록·수강신청', phase: '하계', week: 21 },
  { name: '후기 신입생 등록', phase: '하계', week: 21 },
  { name: '2학기 개강', phase: '2학기', week: 24 },
  { name: '2학기 중간고사', phase: '2학기', week: 32 },
  { name: '전기 신입학 원서접수', phase: '2학기', week: 34 },
  { name: '전기 신입학 합격자 발표', phase: '2학기', week: 36 },
  { name: '2학기 기말고사', phase: '2학기', week: 39 },
  { name: '동계 계절학기', phase: '동계', week: 41 },
  { name: '전기 신입생 등록', phase: '동계', week: 43 },
  { name: '졸업사정·학위수여식', phase: '동계', week: 45 },
];

export const academicYears: AcademicYear[] = [
  { year: 2026, label: '2026학년도', events: events2026 },
  { year: 2027, label: '2027학년도', events: events2027 },
];

export const baseAcademicYear = 2026;

export function findAcademicYear(year: number) {
  return academicYears.find((item) => item.year === year) ?? null;
}

/** One anchor's move between two published calendars. `shift` is in week slots. */
export type CalendarShift = {
  name: string;
  phase: TermPhase;
  fromWeek: number;
  toWeek: number;
  fromLabel: string;
  toLabel: string;
  shift: number;
};

export function compareAcademicYears(fromYear: number, toYear: number): CalendarShift[] {
  const from = findAcademicYear(fromYear);
  const to = findAcademicYear(toYear);
  if (!from || !to) return [];
  return to.events.flatMap((event) => {
    const previous = from.events.find((item) => item.name === event.name);
    if (!previous) return [];
    return [{
      name: event.name,
      phase: event.phase,
      fromWeek: previous.week,
      toWeek: event.week,
      fromLabel: weekLabel(previous.week),
      toLabel: weekLabel(event.week),
      shift: event.week - previous.week,
    }];
  });
}

/** "1주 늦어짐" / "1주 당겨짐" / "변동 없음" — how a shift reads in the comparison table. */
export const shiftLabel = (shift: number) =>
  shift === 0 ? '변동 없음' : shift > 0 ? `${shift}주 늦어짐` : `${Math.abs(shift)}주 당겨짐`;

/** What the plan should do about one task once the calendar moved. */
export type AlignmentAction = 'shift' | 'keep' | 'review';

export const alignmentActionLabels: Record<AlignmentAction, string> = {
  shift: '일정 조정 제안',
  keep: '그대로 진행',
  review: '담당자 확인 필요',
};

/** One task's proposed placement in the target year. Week values are validated server-side. */
export type AlignmentItem = {
  id: string;
  taskTitle: string;
  action: AlignmentAction;
  currentStart: number;
  suggestedStart: number;
  currentLabel: string;
  suggestedLabel: string;
  /** exact `AcademicEvent.name` the proposal leans on, or '' when none applied */
  anchorEvent: string;
  anchorLabel: string;
  anchorShift: number;
  reason: string;
  note: string;
};

export type AlignmentResponse = {
  person: { id: string; name: string; role: string; team: string };
  fromYear: number;
  toYear: number;
  shifts: CalendarShift[];
  items: AlignmentItem[];
};

/** A task may only be placed where it still finishes inside the academic year. */
export const fitsInYear = (start: number, duration: number) => start >= 0 && start + duration <= WEEKS_IN_YEAR;
