'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { WEEKS_IN_YEAR, months, weekLabel } from '../../org-data';
import { useToday } from '../context';

/* ==========================================================================
   The 48-week ruler
   --------------------------------------------------------------------------
   The desktop reading of the academic year: twelve months across the top, 48
   week cells under them, and task bars positioned into that track.

   The week numbers used to be printed into every cell of every row — 48 figures
   per person, twelve people, all of them 9px and none of them readable. They
   are stated once, in the header, and the rows keep only what a row is for: the
   grid the bars sit on, with alternate months shaded so a bar's position can be
   read without counting cells across.

   These pieces used to be one-line components inside `WorkspaceClient`. They
   are here so the mobile reading in `PersonTimelineCard.tsx` can be built
   beside them rather than bolted onto them.
   ========================================================================== */

/** 48 cells forming the week grid a row's bars are positioned over. */
export function WeekGrid() {
  return (
    <>
      {Array.from({ length: WEEKS_IN_YEAR }, (_, index) => (
        <i
          className={`week-cell ${index % 4 === 0 ? 'month-start' : ''} ${Math.floor(index / 4) % 2 === 1 ? 'shaded' : ''}`}
          key={index}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/** The month header above a track, with the week numbers stated once. */
export function WeekHeader({ lead }: { lead: string }) {
  return (
    <div className="month-grid">
      <div className="grid-lead">{lead}</div>
      <div className="month-head">
        <div className="month-labels">
          {months.map((month) => (
            <div className="month-label" key={month}>{month}</div>
          ))}
        </div>
        <div className="week-ruler" aria-hidden="true">
          {Array.from({ length: WEEKS_IN_YEAR }, (_, index) => (
            <span className={index % 4 === 0 ? 'month-start' : ''} key={index}>{(index % 4) + 1}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps the header and rows so the this-week column can run through all of them
 * at once, rather than each row drawing its own segment of it.
 *
 * It is also what makes the track readable at a particular week. Forty-eight
 * columns across twelve rows is a shape you can see and a fact you cannot: a
 * reader could tell that August looked busy and had no way to find out which
 * week of it, or how many people, without counting bars across a 20px column.
 * Pointing at the track now names the week under the pointer and says how many
 * people are on something that week — the two questions the picture raises.
 *
 * `busyByWeek` is optional, and without it the scrubber does not exist: a part
 * or a person's own track is small enough to read directly, and a column
 * following the pointer there would be noise.
 */
export function CalendarBody({ busyByWeek, children }: { busyByWeek?: number[]; children: ReactNode }) {
  const { week } = useToday();
  const [at, setAt] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);

  /* The lead column is a fixed width and the 48 weeks share what is left, so the
     week under the pointer is that remainder divided up — the same arithmetic
     `.today-column` positions itself with, read backwards. */
  const weekAt = (clientX: number) => {
    const node = body.current;
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const lead = parseFloat(getComputedStyle(node).getPropertyValue('--calendar-lead')) || 0;
    const track = box.width - lead;
    if (track <= 0) return null;
    const offset = clientX - box.left - lead;
    if (offset < 0 || offset >= track) return null;
    return Math.min(WEEKS_IN_YEAR - 1, Math.floor((offset / track) * WEEKS_IN_YEAR));
  };

  /* Pointer only. A finger has no hover, and a touch that moved the column would
     be a touch the reader meant as a scroll. */
  const track = busyByWeek
    ? {
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse') return;
        setAt(weekAt(event.clientX));
      },
      onPointerLeave: () => setAt(null),
    }
    : {};

  const reading = at === null ? null : { week: at, busy: busyByWeek?.[at] ?? 0 };

  return (
    <div className="calendar-body" ref={body} {...track}>
      {children}
      {week !== null && <span className="today-column" style={{ '--start': week } as CSSProperties} />}
      {reading && (
        <span className="week-scrubber" style={{ '--start': reading.week } as CSSProperties} aria-hidden="true">
          <b>{weekLabel(reading.week)}</b>
          <em>{reading.busy}명</em>
        </span>
      )}
    </div>
  );
}
