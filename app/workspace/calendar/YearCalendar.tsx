'use client';

import type { ReactNode } from 'react';
import { ScrollX } from '../../ui';

/**
 * A year track, at whatever width is available.
 *
 * Two readings of the same data, switched in CSS rather than in JS: a media
 * query cannot disagree with the server about the viewport, and a `useMedia`
 * hook can — it renders the desktop tree on the server, then swaps on hydration,
 * which is a flash on every phone load. The cost is the inactive tree in the
 * DOM, which for a dozen people is nothing.
 *
 * The wide reading is wrapped in `ScrollX`, so when it does overflow — a tablet,
 * a narrow window — the ruler scrolls inside its own box and the page around it
 * stays put. That is the fix for `overflow-x: auto` on `.workspace-page`, which
 * used to drag the header and breadcrumb sideways with the calendar.
 */
export default function YearCalendar({
  wide,
  narrow,
  label = '연간 업무 일정표',
}: {
  wide: ReactNode;
  narrow: ReactNode;
  label?: string;
}) {
  return (
    <>
      <ScrollX className="calendar-wide" label={label}>
        {wide}
      </ScrollX>
      <div className="calendar-narrow">{narrow}</div>
    </>
  );
}
