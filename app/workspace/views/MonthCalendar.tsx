'use client';

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { calendarMonth, dateParts, isoDate, months, taskLengthLabel, taskSpan, type Person, type Task, type TaskDate } from '../../org-data';
import { useToday } from '../context';

/* ==========================================================================
   Month view
   --------------------------------------------------------------------------
   One 470-character line in the old file held the month nav, the weekday row,
   the date grid, the per-day chips, the agenda list, the empty state and the
   tip. It is four components here, which is what makes the date grid's
   responsive behaviour editable at all.

   The grid used to hang every task off the cell it happened to be in, in
   whatever order the month's list gave: a task's band sat at one height on
   Monday and another on Wednesday, and a second task in the same week pushed
   the first one down on the days they shared. A run holds a lane for the whole
   month now, and every cell prints all the lanes — empty ones as blanks — so a
   band crosses the week on one line.
   ========================================================================== */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** The academic month index (0 = 3월) resolved to a real calendar month. */
export function getCalendarDays(monthIndex: number) {
  const { year, month: realMonth } = calendarMonth(monthIndex);
  const first = new Date(year, realMonth - 1, 1).getDay();
  const count = new Date(year, realMonth, 0).getDate();
  return {
    year,
    realMonth,
    days: count,
    cells: [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[],
  };
}

/**
 * The days of `monthIndex` a task runs across, or `null` when it does not reach the month.
 *
 * This used to be worked out partly from the task's position in the month's list, which meant
 * adding one task moved the days of the others, and the length was the duration in weeks drawn as
 * that many days — a two-week task covered two. It is a function of the task and the month alone
 * now, and of only one thing about the task: the span it covers. A task planned in week slots and
 * one fixed to real dates are the same shape by the time they get here, so the grid draws both
 * from the same arithmetic instead of carrying a second code path for the date-fixed kind.
 *
 * ISO dates compare correctly as strings, which is what clips the span to the month.
 */
function taskRun(task: Task, monthIndex: number, daysInMonth: number) {
  const { year, month } = calendarMonth(monthIndex);
  const span = taskSpan(task);
  const opensOn = isoDate(year, month, 1);
  const closesOn = isoDate(year, month, daysInMonth);
  if (span.to < opensOn || span.from > closesOn) return null;
  return {
    from: span.from > opensOn ? dateParts(span.from).day : 1,
    to: span.to < closesOn ? dateParts(span.to).day : daysInMonth,
    /** false while the task carries on past this month, which the run's end shows */
    endsHere: span.to <= closesOn,
    /** the chip repeats in every month the task runs through, from the 1st */
    continued: span.from < opensOn,
    /** a fixed period is drawn as itself rather than as the weeks it happens to touch */
    fixed: span.fixed,
  };
}

type MonthRun = NonNullable<ReturnType<typeof taskRun>> & {
  task: Task;
  /** the days inside the run that are actually fixed, looked up by the day's own ISO date */
  confirmed: Map<string, TaskDate>;
  /** the row the run keeps in every cell it touches */
  lane: number;
};

/**
 * The month's runs, each on a lane it holds from its first day to its last.
 *
 * Lanes are the whole of what keeps the grid straight: a cell draws lane 0, then lane 1, and so on,
 * so a run drawn on lane 1 is at the same height on every day it covers and the day it starts is
 * level with the day it ends. Longest-first packing means the run that spans the week takes the top
 * lane and the short ones settle underneath it, rather than the order of `person.tasks` deciding.
 */
function monthRuns(tasks: Task[], monthIndex: number, daysInMonth: number): MonthRun[] {
  const runs = tasks.flatMap((task) => {
    const run = taskRun(task, monthIndex, daysInMonth);
    return run
      ? [{
        ...run,
        task,
        confirmed: new Map((task.dates ?? []).map((entry) => [entry.date, entry] as const)),
        lane: 0,
      }]
      : [];
  });
  runs.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || a.task.title.localeCompare(b.task.title));

  /* The last day each lane is taken up to; a run goes in the first lane free by the day it opens. */
  const takenTo: number[] = [];
  for (const run of runs) {
    const free = takenTo.findIndex((day) => day < run.from);
    run.lane = free === -1 ? takenTo.length : free;
    takenTo[run.lane] = run.to;
  }
  return runs;
}

function MonthNav({ monthIndex, setMonthIndex }: { monthIndex: number; setMonthIndex: Dispatch<SetStateAction<number>> }) {
  const { year, realMonth } = getCalendarDays(monthIndex);
  return (
    <div className="month-nav">
      <button type="button" onClick={() => setMonthIndex((current) => (current + 11) % 12)} aria-label="이전 달">‹</button>
      <strong>{year}. {String(realMonth).padStart(2, '0')}</strong>
      <button type="button" onClick={() => setMonthIndex((current) => (current + 1) % 12)} aria-label="다음 달">›</button>
    </div>
  );
}

/**
 * The date grid.
 *
 * The day a task appears on is derived, not stored — the model holds week slots, not dates — so
 * `monthRuns` resolves each task's slots to the days they stand for and hands it a lane.
 *
 * Every day of a run carries the task's name. The grid used to name a run on its first day only
 * and draw the rest as a bare band, which read as one thing crossing the week for anybody who had
 * the first day in view and as an anonymous grey bar for anybody who did not — the second week of a
 * three-week task, the whole of a task that started last month, every day of it in the row below
 * the one it began on. The band is still one band: the days join edge to edge, only its ends are
 * rounded, and only its first day carries the length and the reschedule flag.
 */
function MonthGrid({
  monthIndex,
  person,
  onTask,
}: {
  monthIndex: number;
  person: Person;
  onTask?: (task: Task, person: Person) => void;
}) {
  const today = useToday();
  const calendar = getCalendarDays(monthIndex);
  const runs = monthRuns(person.tasks, monthIndex, calendar.days);
  const lanes = runs.reduce((count, run) => Math.max(count, run.lane + 1), 0);

  return (
    <div className="monthly-calendar">
      <div className="weekday-row">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="date-grid" style={{ '--lanes': lanes } as CSSProperties}>
        {calendar.cells.map((day, index) => {
          const weekend = index % 7 === 0 || index % 7 === 6;
          const isToday = day !== null && day === today.day && monthIndex === today.month;
          return (
            <div
              className={`date-cell ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${day === null ? 'blank' : ''}`}
              key={`${day}-${index}`}
            >
              {day && (
                <>
                  <span className="date-number">{day}</span>
                  {Array.from({ length: lanes }, (_, lane) => {
                    const run = runs.find((item) => item.lane === lane && day >= item.from && day <= item.to);
                    /* The lane is held open on the days it is empty, so the lanes below it stay put. */
                    if (!run) return <span className="date-slot" key={lane} aria-hidden="true" />;

                    const starts = day === run.from;
                    const ends = day === run.to && run.endsHere;
                    /* The band says which weeks the work covers; a filled day says which day of it
                       somebody has to be somewhere. Both belong on the same lane, so the day the
                       task is actually on is the band in the part's colour rather than a chip
                       stacked under it. */
                    const fixed = run.confirmed.get(isoDate(calendar.year, calendar.realMonth, day));
                    const length = taskLengthLabel(run.task);
                    return (
                      <button
                        key={lane}
                        type="button"
                        className={`date-task ${starts ? 'is-start' : ''} ${ends ? 'is-end' : ''} ${run.continued && starts ? 'is-continuation' : ''} ${run.fixed ? 'is-fixed' : ''} ${fixed ? 'is-confirmed' : ''}`}
                        /* One stop per run per month: the day it opens carries the name for the
                           keyboard, and the days that repeat it are there for the eye and the
                           mouse. Thirty tab stops for one task would be the same task thirty
                           times. */
                        tabIndex={starts ? undefined : -1}
                        disabled={!onTask}
                        aria-label={`${run.task.title} · ${length}${fixed ? ` · ${fixed.label || '확정 일자'}` : ''} · 업무 상세 보기`}
                        title={`${run.task.title} · ${length}${fixed ? ` · ${fixed.label || '확정 일자'}` : ''}`}
                        onClick={onTask ? () => onTask(run.task, person) : undefined}
                      >
                        {starts && run.task.movedFrom !== undefined && <i aria-hidden="true">↻</i>}
                        <b>{run.task.title}</b>
                        {fixed ? <mark>{fixed.label || '확정'}</mark> : starts ? <em>{length}</em> : null}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MonthCalendar({
  person,
  monthIndex,
  setMonthIndex,
  onTask,
  action,
}: {
  person: Person;
  monthIndex: number;
  setMonthIndex: Dispatch<SetStateAction<number>>;
  onTask?: (task: Task, person: Person) => void;
  action?: ReactNode;
}) {
  return (
    /* The heading sits above the card, the way the year track's does. It used to
       be inside it, so two sections of the same page framed their titles
       differently. */
    <section className="month-section">
      <div className="section-bar">
        <h2 className="ui-h2">월간 일정</h2>
        <div className="month-section-actions">
          {action}
          <MonthNav monthIndex={monthIndex} setMonthIndex={setMonthIndex} />
        </div>
      </div>
      <p className="calendar-scroll-hint"><span aria-hidden="true">↔</span> 달력을 좌우로 밀어 다른 날짜를 확인하세요.</p>
      <div className="monthly-layout calendar-card" role="region" aria-label={`${months[monthIndex]} 월간 일정, 가로로 스크롤 가능`} tabIndex={0}>
        <MonthGrid monthIndex={monthIndex} person={person} onTask={onTask} />
      </div>
    </section>
  );
}
