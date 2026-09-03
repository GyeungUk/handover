'use client';

import type { CSSProperties } from 'react';
import { Avatar } from '../../ui';
import { WEEKS_IN_YEAR, months, taskLengthLabel, taskStartLabel, taskTrack, type Person, type Task } from '../../org-data';
import { useToday } from '../context';

/* ==========================================================================
   The phone reading of a year
   --------------------------------------------------------------------------
   A 48-column ruler needs about 1,400px to be legible, so the workspace used to
   set `min-width: 1440px` on the calendar and `overflow-x: auto` on the page —
   which meant a phone scrolled the entire layout sideways, header, breadcrumb
   and all, to read one row of bars 6px wide.

   This is the same information rebuilt for the width that is actually there: a
   twelve-cell month strip that keeps the "when" readable at a glance, and the
   tasks themselves as rows underneath, where their titles have room to be read
   rather than clipped into a bar.
   ========================================================================== */

/** Which of the twelve months a person has any work in, and how heavily. */
function monthLoad(person: Person) {
  const load = Array<number>(12).fill(0);
  for (const task of person.tasks) {
    /* The weeks the task is drawn on — its confirmed days' weeks once it has any. */
    const { start, duration } = taskTrack(task);
    for (let week = start; week < Math.min(WEEKS_IN_YEAR, start + duration); week += 1) {
      load[Math.floor(week / 4)] += 1;
    }
  }
  return load;
}

/**
 * Twelve cells, one per month, shaded by how much of that month is committed.
 *
 * At 320px this is ~22px per cell — wide enough to hit and to read the month
 * number under, which a 48-column ruler never is.
 */
export function MonthStrip({ person, color, activeMonth }: { person: Person; color: string; activeMonth?: number }) {
  const load = monthLoad(person);
  const peak = Math.max(1, ...load);
  const today = useToday();
  return (
    <div className="month-strip" aria-hidden="true">
      {load.map((value, month) => (
        <i
          key={month}
          className={`${value ? 'busy' : ''} ${month === activeMonth ? 'active' : ''} ${month === today.month ? 'now' : ''}`}
          style={{ '--fill': value ? `${Math.round(28 + (value / peak) * 72)}%` : '0%', '--team': color } as CSSProperties}
        >
          <b>{months[month].replace('월', '')}</b>
        </i>
      ))}
    </div>
  );
}

/**
 * One person on a phone: who they are, when they are busy, and what the work is.
 *
 * `onTask` is optional because the org-wide overview only needs the shape of
 * someone's year, while a part's page wants every task openable.
 */
export default function PersonTimelineCard({
  person,
  color,
  onPerson,
  onTask,
}: {
  person: Person;
  color: string;
  onPerson?: () => void;
  onTask?: (task: Task, person: Person) => void;
}) {
  return (
    <div className="timeline-card">
      <button className="timeline-card-head" type="button" onClick={onPerson} disabled={!onPerson}>
        <Avatar size="sm" color={color}>{person.initial}</Avatar>
        <span>
          <b>{person.name}</b>
          <small>{person.role}</small>
        </span>
        {onPerson && <i aria-hidden="true">›</i>}
      </button>

      <MonthStrip person={person} color={color} />

      <ul className="timeline-tasks">
        {person.tasks.map((task) => {
          const body = (
            <>
              <span className="when">
                {taskStartLabel(task)}
                <em>{taskLengthLabel(task)}</em>
              </span>
              <span className="what">
                <b>{task.title}</b>
                {task.movedFrom !== undefined && <mark>일정 변경</mark>}
              </span>
            </>
          );
          return (
            <li key={`${task.title}-${task.start}`} style={{ '--team': color } as CSSProperties}>
              {onTask ? (
                <button type="button" onClick={() => onTask(task, person)}>
                  {body}
                  <i aria-hidden="true">›</i>
                </button>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
        {person.tasks.length === 0 && <li className="timeline-empty">등록된 주요 업무가 없습니다.</li>}
      </ul>
    </div>
  );
}
