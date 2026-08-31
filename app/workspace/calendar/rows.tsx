'use client';

import type { CSSProperties } from 'react';
import { WEEKS_IN_YEAR, weekLabel, type Person, type Task, type Team } from '../../org-data';
import { WeekGrid } from './WeekRuler';

/** Merge a person's overlapping tasks into continuous busy stretches. */
export function busyRuns(person: Person) {
  const busy = Array.from({ length: WEEKS_IN_YEAR }, (_, week) =>
    person.tasks.some((task) => week >= task.start && week < task.start + task.duration));
  const runs: { start: number; duration: number }[] = [];
  let week = 0;
  while (week < WEEKS_IN_YEAR) {
    if (!busy[week]) { week += 1; continue; }
    const start = week;
    while (week < WEEKS_IN_YEAR && busy[week]) week += 1;
    runs.push({ start, duration: week - start });
  }
  return runs;
}

/**
 * The org-wide reading of one person: density only, no titles.
 *
 * At twelve people on one screen there is no room for task names, and pretending
 * otherwise is what produced 6px-wide bars with clipped text. The bars here say
 * "busy" and nothing more; the part page is where the work gets named.
 */
export function PersonLoadRow({ person, color, onPerson }: { person: Person; color: string; onPerson?: () => void }) {
  return (
    <div className="person-week-row">
      <button className="person-cell" type="button" onClick={onPerson} disabled={!onPerson}>
        <span className="person-avatar" style={{ background: color }}>{person.initial}</span>
        <span><b>{person.name}</b><small>{person.role}</small></span>
        <i aria-hidden="true">›</i>
      </button>
      <div className="task-timeline">
        <WeekGrid />
        {busyRuns(person).map((run) => (
          <span
            className="load-bar"
            key={run.start}
            style={{ '--start': run.start, '--duration': run.duration, background: color } as CSSProperties}
            /* The merged run is anonymous by design, but the reader hovering it
               is asking exactly one question: what is in here. */
            title={`${weekLabel(run.start)}부터 ${run.duration}주 · ${person.tasks
              .filter((task) => task.start < run.start + run.duration && task.start + task.duration > run.start)
              .map((task) => task.title)
              .join(', ')}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== 
   Naming the work on a year track
   --------------------------------------------------------------------------
   A task is one visual unit: colour, title and period stay together inside the
   same bar. The desktop calendar gives every week enough physical width for a
   two-week task to carry two lines of Korean text, and scrolls within its own
   frame instead of detaching the label from the schedule it describes.
   ========================================================================== */

type Placed = {
  task: Task;
  lane: number;
  inside: boolean;
  flipped: boolean;
  displayStart: number;
  displayDuration: number;
};

/** Minimum visual room for a title + period while keeping the whole year visible. */
const MIN_CARD_WEEKS = 7;

/**
 * Greedy interval packing over the task bars.
 *
 * A task goes in the first lane whose prior task has finished, and a new lane
 * opens only for a real overlap. Labels no longer claim space beside a bar.
 */
export function layoutTasks(tasks: Task[]): { placed: Placed[]; lanes: number } {
  const claims = tasks.map((task) => {
    const displayDuration = Math.max(task.duration, MIN_CARD_WEEKS);
    const displayStart = Math.min(task.start, WEEKS_IN_YEAR - displayDuration);
    return {
      task,
      inside: true,
      flipped: displayStart < task.start,
      displayStart,
      displayDuration,
      from: displayStart,
      to: displayStart + displayDuration,
    };
  });

  const laneEnds: number[] = [];
  const placed = claims
    .sort((a, b) => a.from - b.from || b.to - a.to)
    .map(({ task, inside, flipped, displayStart, displayDuration, from, to }) => {
      let lane = laneEnds.findIndex((end) => end <= from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = to;
      return { task, lane, inside, flipped, displayStart, displayDuration };
    });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

/** One person's named tasks on the year track — the part and person pages. */
export function PersonTaskRow({
  person,
  team,
  onPerson,
  onTask,
}: {
  person: Person;
  team: Team;
  onPerson: () => void;
  onTask: (task: Task, person: Person) => void;
}) {
  const { placed, lanes } = layoutTasks(person.tasks);
  return (
    <div
      className="task-person-row"
      style={{ '--lanes': lanes, '--row-pad': '14px', '--lane-h': '72px', '--bar-h': '64px' } as CSSProperties}
    >
      <button className="team-person-card" type="button" onClick={onPerson}>
        <span className="person-avatar large" style={{ background: team.color }}>{person.initial}</span>
        <span><b>{person.name}</b><small>{person.role}</small></span>
        <i aria-hidden="true">›</i>
      </button>
      <div className="task-timeline">
        <WeekGrid />
        {placed.map(({ task, lane, inside, flipped, displayStart, displayDuration }) => (
          <button
            className={`task-bar ${inside ? 'is-inside' : 'is-beside'} ${flipped ? 'is-flipped' : ''} ${task.movedFrom !== undefined ? 'is-moved' : ''}`}
            key={`${task.title}-${task.start}`}
            style={{
              '--start': displayStart,
              '--duration': displayDuration,
              '--lane': lane,
              '--team': team.color,
              '--actual-width': `${(task.duration / displayDuration) * 100}%`,
            } as CSSProperties}
            type="button"
            onClick={() => onTask(task, person)}
            title={task.movedFrom !== undefined ? `${task.title} · ${weekLabel(task.movedFrom)}에서 변경됨` : task.title}
          >
            <span className="task-bar-fill" aria-hidden="true" />
            <span className="task-bar-label">
              {task.movedFrom !== undefined && <i className="moved-flag" aria-hidden="true">↻</i>}
              <b>{task.title}</b>
              <span>{weekLabel(task.start)} · {task.duration}주</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
