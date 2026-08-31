import type { CSSProperties, ReactNode } from 'react';

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
 */
export function ChipRail({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="ui-chip-rail" role="group" aria-label={label}>{children}</div>;
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
