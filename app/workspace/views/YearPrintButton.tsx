'use client';

import { useState } from 'react';
import { Button, IconPrint } from '../../ui';
import { useToday } from '../context';
import { printYearPlan, type YearScope } from '../year-print';

/**
 * "연간 업무표 PDF" — the year plan, as a document that leaves the screen.
 *
 * The calendar screens are what this office actually works from, and until now the only way to
 * take one into a meeting was a photograph of a monitor. The sheet is not a picture of the year
 * track: it is the same facts laid out for A4 — a landscape grid of who is busy when, and a table
 * naming every task with the week it opens and how long it runs.
 *
 * The busy state is not decoration. The sheet is built and laid out synchronously, and for the
 * whole office that is twelve people, four parts and around fifty tasks — long enough on a phone
 * for a reader to press twice and get two print dialogs. Blocking the button for the frame it takes
 * is the cheapest way to make that impossible.
 */
export default function YearPrintButton({ scope, label = '연간 업무표 PDF' }: { scope: YearScope; label?: string }) {
  const today = useToday();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      busy={busy}
      busyLabel="준비 중"
      leading={<IconPrint />}
      title="브라우저 인쇄 창에서 PDF로 저장할 수 있습니다."
      onClick={() => {
        setBusy(true);
        /* Painted before the main thread goes away to build the sheet, so the spinner is seen. */
        requestAnimationFrame(() => {
          try {
            printYearPlan(scope, { todayWeek: today.week });
          } finally {
            setBusy(false);
          }
        });
      }}
    >
      {label}
    </Button>
  );
}
