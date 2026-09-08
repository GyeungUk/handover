'use client';

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { calendarMonth, confirmedDays, dateParts, isoDate, months, taskLengthLabel, taskSpan, type Person, type Task, type TaskDate } from '../../org-data';
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
 * The stretches of `monthIndex` a task is drawn on, empty when it does not reach the month.
 *
 * Which days those are depends on one thing: whether anybody has settled a day of it. A task
 * planned in week slots covers the days its slots stand for, as one band, and so does a task fixed
 * to a period — they are the same shape by the time they get here, so the grid draws both from the
 * same arithmetic instead of carrying a second code path for the date-fixed kind.
 *
 * A task with confirmed days covers those days and nothing else. The loose window behind it was
 * only ever a guess about where the day would fall, and once the day is known, drawing the guess
 * across five weeks of the grid says the work runs for five weeks when it runs for a morning. The
 * window still exists — it is what bounds the next day anybody records — but it is no longer what
 * the month shows.
 *
 * ISO dates compare correctly as strings, which is what clips a span to the month.
 */
function taskRuns(task: Task, monthIndex: number, daysInMonth: number) {
  const { year, month } = calendarMonth(monthIndex);
  const opensOn = isoDate(year, month, 1);
  const closesOn = isoDate(year, month, daysInMonth);
  const span = taskSpan(task);
  const settled = confirmedDays(task);

  if (settled.length) {
    return settled
      .filter((day) => day.date >= opensOn && day.date <= closesOn)
      .map((day) => ({
        from: dateParts(day.date).day,
        to: dateParts(day.date).day,
        endsHere: true,
        continued: false,
        fixed: span.fixed,
        /** the day itself, which is what this run is */
        confirmed: day as TaskDate | undefined,
      }));
  }

  if (span.to < opensOn || span.from > closesOn) return [];
  return [{
    from: span.from > opensOn ? dateParts(span.from).day : 1,
    to: span.to < closesOn ? dateParts(span.to).day : daysInMonth,
    /** false while the task carries on past this month, which the run's end shows */
    endsHere: span.to <= closesOn,
    /** the chip repeats in every month the task runs through, from the 1st */
    continued: span.from < opensOn,
    /** a fixed period is drawn as itself rather than as the weeks it happens to touch */
    fixed: span.fixed,
    confirmed: undefined as TaskDate | undefined,
  }];
}

type MonthRun = ReturnType<typeof taskRuns>[number] & {
  task: Task;
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
 *
 * A lane is claimed by the task rather than by each of its runs, so the several confirmed days of
 * one task stay on one line across the month instead of scattering down the cell.
 */
function monthRuns(tasks: Task[], monthIndex: number, daysInMonth: number): MonthRun[] {
  const drawn = tasks
    .map((task) => ({ task, runs: taskRuns(task, monthIndex, daysInMonth) }))
    .filter((entry) => entry.runs.length)
    .map((entry) => ({
      ...entry,
      from: Math.min(...entry.runs.map((run) => run.from)),
      to: Math.max(...entry.runs.map((run) => run.to)),
    }));
  drawn.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || a.task.title.localeCompare(b.task.title));

  /* The last day each lane is taken up to; a task goes in the first lane free by the day it opens. */
  const takenTo: number[] = [];
  return drawn.flatMap(({ task, runs, from, to }) => {
    const free = takenTo.findIndex((day) => day < from);
    const lane = free === -1 ? takenTo.length : free;
    takenTo[lane] = to;
    return runs.map((run) => ({ ...run, task, lane }));
  });
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
                    const fixed = run.confirmed;
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

/**
 * The month's work as a list, under the grid and only on a phone.
 *
 * Seven columns will not carry a Korean task title at 375px — the grid used to keep its desktop
 * 720px and scroll sideways inside its card, which put four of the seven weekdays off-screen and
 * made the month unreadable without dragging it. The grid keeps all seven columns now and draws
 * each run as a bare coloured band, and the titles the bands can no longer hold are read here
 * instead. Every row opens the same task the band does.
 */
function MonthAgenda({
  monthIndex,
  person,
  onTask,
}: {
  monthIndex: number;
  person: Person;
  onTask?: (task: Task, person: Person) => void;
}) {
  const calendar = getCalendarDays(monthIndex);
  const runs = monthRuns(person.tasks, monthIndex, calendar.days);
  if (!runs.length) return null;

  /* One row per task, not per run: a task with four settled days is one thing that happens on four
     days, and four rows of the same title would read as four tasks. */
  const rows = new Map<string, { task: Task; lane: number; from: number; to: number; days: number[] }>();
  for (const run of runs) {
    const seen = rows.get(run.task.title);
    const day = run.confirmed ? [run.from] : [];
    if (!seen) {
      rows.set(run.task.title, { task: run.task, lane: run.lane, from: run.from, to: run.to, days: day });
      continue;
    }
    seen.from = Math.min(seen.from, run.from);
    seen.to = Math.max(seen.to, run.to);
    seen.days.push(...day);
  }

  const ordered = [...rows.values()].sort((a, b) => a.from - b.from || a.lane - b.lane);

  return (
    <div className="month-agenda month-agenda-phone">
      <div className="month-agenda-head">
        <h3>{months[monthIndex]} 일정</h3>
        <span>{ordered.length}건</span>
      </div>
      <div className="month-agenda-list">
        {ordered.map(({ task, from, to, days }) => {
          /* Settled days are the days themselves; a planned run is the stretch it covers. */
          const when = days.length
            ? days.length <= 3
              ? days.map((day) => `${day}일`).join(', ')
              : `${days[0]}일 외 ${days.length - 1}일`
            : from === to
              ? `${from}일`
              : `${from}일 – ${to}일`;
          return (
            <button
              key={task.title}
              type="button"
              disabled={!onTask}
              onClick={onTask ? () => onTask(task, person) : undefined}
            >
              <i aria-hidden="true" style={{ background: 'var(--team)' }} />
              <span>
                <b>{task.title}</b>
                <small>
                  {months[monthIndex]} {when} <em>· {taskLengthLabel(task)}</em>
                </small>
              </span>
            </button>
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
      <div className="monthly-layout calendar-card" role="region" aria-label={`${months[monthIndex]} 월간 일정`}>
        <MonthGrid monthIndex={monthIndex} person={person} onTask={onTask} />
        <MonthAgenda monthIndex={monthIndex} person={person} onTask={onTask} />
      </div>
    </section>
  );
}
