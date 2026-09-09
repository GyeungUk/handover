'use client';

import { useEffect, useRef } from 'react';

/**
 * Counts a figure up to its value the first time it is shown.
 *
 * This exists for one reason: a number is the only thing on a dashboard that a reader has to be
 * told is a *measurement* rather than a label. "12" printed in the same instant as the word beside
 * it reads as part of the layout; "12" arriving through 3, 7, 10 reads as something that was
 * counted, and the reader looks at it. That is the whole effect, and it is worth about a third of
 * a second.
 *
 * ## Why it writes to the DOM instead of holding state
 *
 * The obvious version keeps the displayed number in `useState` and the obvious version is wrong
 * twice over. It re-renders the component sixty times a second to change one text node. And it
 * cannot decide where to start without asking `matchMedia`, which the server cannot answer — so
 * either the server renders the final value and the client renders zero, which is a hydration
 * mismatch, or the count never runs on first paint, which is the only paint that matters.
 *
 * Writing through a ref sidesteps both. The server renders the real number, the client keeps
 * rendering the real number, and the animation is a sequence of `textContent` writes that React
 * never has to know about. It also means a re-render for any other reason cannot restart the count.
 *
 * The one thing this relies on is being under an entrance: the figure is still at `opacity: 0` for
 * the first frames of its `.rise`, which is what covers the moment between the server's markup and
 * the first frame of the count.
 *
 * ## Why it counts from what is on screen
 *
 * The first version remembered "the value I have already animated to" and skipped the work if it
 * matched. In development that made it never run at all: React mounts an effect, tears it down and
 * mounts it again, so the first pass wrote the starting frame and claimed the value, its cleanup
 * cancelled the frame loop, and the second pass saw the value already claimed and returned — the
 * figure sat on `0` forever. Tracking what is *displayed* rather than what was *intended* is
 * immune to that: a remount reads the partial number off the ref and carries on from it, an
 * interrupted count resumes rather than restarts, and a value that genuinely changes counts from
 * the old number to the new one instead of from zero.
 *
 * Two more details keep it from being a gimmick. It lands exactly, because the last frame is
 * assigned rather than interpolated. And it declines entirely under `prefers-reduced-motion`, or
 * when the value is small enough that counting to it would be two frames of flicker rather than a
 * movement.
 */
export function useCountUp<T extends HTMLElement>(
  value: number,
  { duration = 750, delay = 0 }: { duration?: number; delay?: number } = {},
) {
  const ref = useRef<T>(null);
  /* The number currently painted into the node — not the number it is heading for. */
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown.current === value) return;

    const write = (next: number) => {
      shown.current = next;
      node.textContent = String(next);
    };

    const still = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* Under about four steps there is nothing to see; the number just flickers. */
    const trivial = !Number.isFinite(value) || Math.abs(value) < 4;
    if (still || trivial) {
      write(value);
      return;
    }

    const from = shown.current ?? 0;
    write(from);

    let frame = 0;
    let started = 0;
    /* Cubic ease-out: most of the count is over before the reader has finished moving their eye to
       it, and it is slow at the end, where the actual number is. */
    const eased = (progress: number) => 1 - (1 - progress) ** 3;

    const step = (now: number) => {
      if (!started) started = now;
      const elapsed = now - started - delay;
      if (elapsed < 0) { frame = requestAnimationFrame(step); return; }
      const progress = Math.min(1, elapsed / duration);
      if (progress >= 1) {
        write(value);
        return;
      }
      write(Math.round(from + (value - from) * eased(progress)));
      frame = requestAnimationFrame(step);
    };

    /* Timed against a timestamp rather than counted per frame, so the duration is the duration on
       a 60Hz laptop and on a 120Hz phone alike. */
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, delay]);

  return ref;
}
