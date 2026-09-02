'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { calendarMonth, dateParts, isoDate, taskLengthLabel, taskSpan, type Person, type Task, type Team } from '../../org-data';
import { useToday } from '../context';

/* ==========================================================================
   Month view
   --------------------------------------------------------------------------
   One 470-character line in the old file held the month nav, the weekday row,
   the date grid, the per-day chips, the agenda list, the empty state and the
   tip. It is five components here, which is what makes the date grid's
   responsive behaviour editable at all.

   The column beside the grid used to be a grey slab holding one or two entries
   and then three hundred pixels of nothing, and the only way to another month
   was to step through them one arrow at a time. It carries the twelve months
   now, marked with whether there is work in them, so the empty half of the
   panel became the fastest way to move around the year.
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
 * The day a task appears on is derived, not stored — the model holds week
 * slots, not dates — so `taskRun` resolves each task's slots to the days they
 * stand for. A run is a chip on its first day and a spine on the rest, which is
 * how five days read as one task crossing the week rather than as the same chip
 * printed five times.
 */
function MonthGrid({
  monthIndex,
  team,
  person,
  monthTasks,
  onTask,
}: {
  monthIndex: number;
  team: Team;
  person: Person;
  monthTasks: Task[];
  onTask: (task: Task, person: Person) => void;
}) {
  const today = useToday();
  const calendar = getCalendarDays(monthIndex);
  const runs = monthTasks.flatMap((task) => {
    const run = taskRun(task, monthIndex, calendar.days);
    return run ? [{
      task,
      ...run,
      /* The days inside the run that are actually fixed, looked up by the cell's own ISO date. */
      confirmed: new Map((task.dates ?? []).map((entry) => [entry.date, entry] as const)),
    }] : [];
  });

  return (
    <div className="monthly-calendar">
      <div className="weekday-row">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="date-grid">
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
                  {runs
                    .filter((run) => day >= run.from && day <= run.to)
                    .flatMap((run) => {
                      /* The band says which weeks the work covers; a marker says which day of it
                         somebody has to be somewhere. Both belong on the cell, so the run is drawn
                         unbroken and the marker sits on it. */
                      const fixed = run.confirmed.get(isoDate(calendar.year, calendar.realMonth, day));
                      return [
                        day === run.from ? (
                          <button
                            key={run.task.title}
                            type="button"
                            className={`date-task ${run.to > run.from ? 'is-open' : ''} ${run.continued ? 'is-continuation' : ''} ${run.fixed ? 'is-fixed' : ''}`}
                            style={{ background: team.soft, color: team.color } as CSSProperties}
                            onClick={() => onTask(run.task, person)}
                          >
                            <b>{run.task.title}</b>
                            <small>{run.task.note}</small>
                            <em>{taskLengthLabel(run.task)}</em>
                            {run.task.movedFrom !== undefined && <mark>일정 변경</mark>}
                          </button>
                        ) : (
                          <span
                            key={run.task.title}
                            className={`date-run ${day === run.to && run.endsHere ? 'is-end' : ''}`}
                            aria-hidden="true"
                          />
                        ),
                        fixed ? (
                          <button
                            key={`${run.task.title}-fixed`}
                            type="button"
                            className="date-confirmed"
                            onClick={() => onTask(run.task, person)}
                          >
                            {fixed.label || '확정 일자'}
                          </button>
                        ) : null,
                      ];
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
  team,
  monthIndex,
  setMonthIndex,
  onTask,
}: {
  person: Person;
  team: Team;
  monthIndex: number;
  setMonthIndex: Dispatch<SetStateAction<number>>;
  onTask: (task: Task, person: Person) => void;
}) {
  /* Asked of the span rather than of the week slots, so a task fixed to dates that spill past the
     slots it was planned on still appears in the month those dates are actually in. */
  const { days } = getCalendarDays(monthIndex);
  const monthTasks = person.tasks.filter((task) => taskRun(task, monthIndex, days) !== null);

  return (
    /* The heading sits above the card, the way the year track's does. It used to
       be inside it, so two sections of the same page framed their titles
       differently. */
    <section className="month-section">
      <div className="section-bar">
        <h2 className="ui-h2">월간 일정</h2>
        <MonthNav monthIndex={monthIndex} setMonthIndex={setMonthIndex} />
      </div>
      <div className="monthly-layout calendar-card">
        <MonthGrid monthIndex={monthIndex} team={team} person={person} monthTasks={monthTasks} onTask={onTask} />
      </div>
    </section>
  );
}
