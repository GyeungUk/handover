'use client';

import type { CSSProperties, ReactNode } from 'react';
import { WEEKS_IN_YEAR, months } from '../../org-data';
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
 */
export function CalendarBody({ children }: { children: ReactNode }) {
  const { week } = useToday();
  return (
    <div className="calendar-body">
      {children}
      {week !== null && <span className="today-column" style={{ '--start': week } as CSSProperties} />}
    </div>
  );
}
