'use client';

import type { CSSProperties, ReactNode } from 'react';
import { WEEKS_IN_YEAR } from '../../org-data';

/* ==========================================================================
   The summary strip
   --------------------------------------------------------------------------
   Every working screen opened with a white card 1200px wide holding three
   labels and three figures, all of them clustered at the left — most of the bar
   was empty, which reads as a card that failed to load rather than a summary.

   It is one strip now: the counts on the left, and on the right whatever that
   screen actually has to say — the part colours on the org view, how much of
   the year is committed on a part or a person. The width is carrying meaning
   instead of standing in for it.
   ========================================================================== */

export function SummaryBar({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="workspace-summary">
      <div className="workspace-stats">{children}</div>
      {aside && <div className="workspace-summary-aside">{aside}</div>}
    </div>
  );
}

/**
 * How much of the 48-week year is committed.
 *
 * The figure alone ("29주, 48주 중") makes the reader do the division; the track
 * shows it, and the gap at the end of it is the answer to the question the
 * whole product exists for — when is there room to hand the work over.
 */
export function YearMeter({
  busyWeeks,
  color,
  label = '업무가 있는 주',
}: {
  busyWeeks: number;
  color?: string;
  label?: string;
}) {
  const free = WEEKS_IN_YEAR - busyWeeks;
  const percent = Math.round((busyWeeks / WEEKS_IN_YEAR) * 100);
  return (
    <div className="year-meter" style={color ? ({ '--team': color } as CSSProperties) : undefined}>
      <div className="year-meter-head">
        <span>{label}</span>
        <b>{busyWeeks}<small> / {WEEKS_IN_YEAR}주</small></b>
      </div>
      <div
        className="year-meter-track"
        role="img"
        aria-label={`${WEEKS_IN_YEAR}주 가운데 ${busyWeeks}주에 업무가 있습니다`}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="year-meter-legend">
        <span><i className="busy" aria-hidden="true" />집중 {busyWeeks}주</span>
        <span><i className="free" aria-hidden="true" />여유 {free}주</span>
      </div>
    </div>
  );
}
