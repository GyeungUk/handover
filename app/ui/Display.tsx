'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/* ==========================================================================
   Badge / Chip / Avatar / Stat / Skeleton / Empty
   --------------------------------------------------------------------------
   The small pieces. Grouped in one file because none of them is more than a
   few lines and they are almost always reached for together.
   ========================================================================== */

export type BadgeTone = 'grey' | 'blue' | 'green' | 'amber' | 'red' | 'solid';

/** A status pill. Never interactive — if it can be pressed it is a `Chip`. */
export function Badge({ tone = 'grey', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`ui-badge ${tone} ${className}`}>{children}</span>;
}

/** A filter. Quiet until it is the selected one, then it goes solid ink. */
export function Chip({
  active = false,
  onClick,
  dot,
  children,
  className = '',
  style,
}: { active?: boolean; onClick: () => void; dot?: boolean; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      className={`ui-chip ${active ? 'active' : ''} ${className}`}
      style={style}
      onClick={onClick}
      aria-pressed={active}
    >
      {dot && <i aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * A row of chips that scrolls sideways instead of wrapping.
 *
 * Wrapping a twelve-part filter onto four lines costs more vertical space on a
 * phone than the content it filters, so it scrolls — bled to the page edge so
 * it reads as a scroller rather than a clipped row.
 *
 * The selected chip is scrolled back into view whenever it changes. Without it
 * the rail answered "which part am I looking at?" only for the parts that
 * happened to fit: opening the last part of four on a 375px phone left its chip
 * a hundred pixels past the right edge, so the one chip that was solid ink —
 * the only thing on the screen naming the current filter — was the one the
 * reader could not see.
 */
export function ChipRail({ children, label }: { children: ReactNode; label?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  /* The chip this last ran for. The effect has no dependency list — the
     selection lives in whatever renders the chips, not here — so without this
     the rail would snap back to the selected chip on every parent render and
     take away any scrolling the reader had just done by hand. */
  const settled = useRef<Element | null>(null);

  useEffect(() => {
    const active = rail.current?.querySelector('.ui-chip.active') ?? null;
    if (active === settled.current) return;
    settled.current = active;
    /* `nearest` so a chip already on screen does not move, and the block stays
       put — this is a row inside a page that is scrolled independently. */
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  /*
   * Which edges have chips behind them, published as `data-edge` for the mask in
   * `primitives.css` to fade.
   *
   * The rail hides its scrollbar — it is a switcher, not a list — and it opens
   * scrolled to whichever chip is selected. Select the last part on a phone and
   * the rail opens at its far end, where the first chip is cut vertically in
   * half by the viewport edge: that reads as a broken layout rather than as
   * "there is more this way", and the parts scrolled past are, as far as the
   * reader can tell, not there at all.
   *
   * Pure CSS cannot answer "is this scrolled?" — the background-gradient trick
   * paints its shadow behind the chips, which are opaque pills, so it shows
   * nothing here. Measuring is three lines, and the component already holds the
   * ref and runs an effect.
   */
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const measure = () => {
      /* 2px of slack: fractional layout widths make an unscrollable rail report
         a scrollWidth a hair over its clientWidth, which would fade both ends of
         a rail that has nothing hidden at either. */
      const start = node.scrollLeft > 2;
      const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
      node.dataset.edge = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
    };
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    /* The rail's own width changes with the viewport, and its content changes
       when a part is added — one observer covers both. */
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  });

  return <div className="ui-chip-rail" ref={rail} role="group" aria-label={label} data-edge="none">{children}</div>;
}

export function Avatar({
  children,
  size = 'md',
  color,
  round = false,
  className = '',
}: { children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string; round?: boolean; className?: string }) {
  return (
    <span
      className={`ui-avatar ${size === 'md' ? '' : size} ${round ? 'round' : ''} ${className}`}
      style={color ? { background: color } : undefined}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * Label above, figure below.
 *
 * The old stat blocks put a 10px label under the number, which made the label
 * read as a footnote to a figure nobody had been told the meaning of yet.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  className = '',
}: { label: ReactNode; value: ReactNode; unit?: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`ui-stat ${className}`}>
      <span className="label">{label}</span>
      <span className="value">{value}{unit && <small>{unit}</small>}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function StatGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-stat-group ${className}`}>{children}</div>;
}

export function Skeleton({ width, height = 16, radius, className = '' }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return (
    <span
      className={`ui-skeleton ${className}`}
      style={{ display: 'block', width: width ?? '100%', height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function Empty({ glyph, title, sub, action }: { glyph?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {glyph && <span className="glyph" aria-hidden="true">{glyph}</span>}
      <p className="ui-text lg strong">{title}</p>
      {sub && <p className="ui-text sm muted">{sub}</p>}
      {action}
    </div>
  );
}
