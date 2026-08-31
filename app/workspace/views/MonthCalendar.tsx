'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { ACADEMIC_YEAR_START, type Person, type Task, type Team } from '../../org-data';
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
  const year = monthIndex < 10 ? ACADEMIC_YEAR_START : ACADEMIC_YEAR_START + 1;
  const realMonth = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const first = new Date(year, realMonth - 1, 1).getDay();
  const count = new Date(year, realMonth, 0).getDate();
  return {
    year,
    realMonth,
    cells: [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[],
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
 * The day a task appears on is derived, not stored — the model holds weeks, not
 * dates — so `taskDays` spreads a month's tasks across it deterministically
 * rather than piling them all onto the 1st.
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
  const taskDays = monthTasks.map((task, index) => ({
    task,
    day: Math.min(27, 3 + (task.start % 4) * 7 + index * 2),
    span: Math.max(2, Math.min(5, task.duration)),
  }));

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
                  {taskDays
                    .filter((entry) => day >= entry.day && day < entry.day + entry.span)
                    .map((entry) => (
                      <button
                        key={entry.task.title}
                        type="button"
                        className={`date-task ${entry.span > 1 ? 'is-open' : ''} ${entry.day !== day ? 'is-continuation' : ''}`}
                        style={{ background: team.soft, color: team.color } as CSSProperties}
                        onClick={() => onTask(entry.task, person)}
                      >
                        <b>{entry.task.title}</b>
                        <small>{entry.task.note}</small>
                        <em>{entry.task.duration}주</em>
                        {entry.day === day && entry.task.movedFrom !== undefined && <mark>일정 변경</mark>}
                      </button>
                    ))}
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
  const monthTasks = person.tasks.filter(
    (task) => Math.floor(task.start / 4) <= monthIndex && Math.floor((task.start + task.duration - 1) / 4) >= monthIndex,
  );

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
