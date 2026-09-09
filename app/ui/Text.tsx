'use client';

import type { ElementType, ReactNode } from 'react';
import { useCountUp } from './useCountUp';

type TextTone = 'default' | 'strong' | 'muted';
type TextSize = 'lg' | 'body' | 'sm' | 'caption';

/**
 * The type ramp, as components.
 *
 * Headings take an explicit `as` because the level that looks right and the
 * level that reads right to a screen reader are rarely the same one — a modal's
 * title is visually an h2 and structurally an h2, but a card's title inside it
 * is visually an h3 and structurally an h4.
 */
export function Display({ as: Tag = 'h1', children, className = '' }: { as?: ElementType; children: ReactNode; className?: string }) {
  return <Tag className={`ui-display ${className}`}>{children}</Tag>;
}

export function H1({ as: Tag = 'h1', children, className = '' }: { as?: ElementType; children: ReactNode; className?: string }) {
  return <Tag className={`ui-h1 ${className}`}>{children}</Tag>;
}

export function H2({ as: Tag = 'h2', id, children, className = '' }: { as?: ElementType; id?: string; children: ReactNode; className?: string }) {
  return <Tag className={`ui-h2 ${className}`} id={id}>{children}</Tag>;
}

export function H3({ as: Tag = 'h3', children, className = '' }: { as?: ElementType; children: ReactNode; className?: string }) {
  return <Tag className={`ui-h3 ${className}`}>{children}</Tag>;
}

export function Text({
  as: Tag = 'p',
  size = 'body',
  tone = 'default',
  children,
  className = '',
}: { as?: ElementType; size?: TextSize; tone?: TextTone; children: ReactNode; className?: string }) {
  const sizeClass = size === 'body' ? '' : size;
  const toneClass = tone === 'default' ? '' : tone;
  return <Tag className={`ui-text ${sizeClass} ${toneClass} ${className}`}>{children}</Tag>;
}

/** Tabular numerals, so a column of figures lines up on the decimal. */
/**
 * A number, in tabular figures.
 *
 * `count` makes it arrive by counting rather than by appearing — see `useCountUp` for why that is
 * worth doing and when it declines to. It is opt-in because most figures in the product sit inside
 * a table or a row where a moving number would be noise; it belongs on the handful that a reader
 * is meant to look *at* rather than read past.
 */
export function Figure({ children, count = false, className = '' }: { children: ReactNode; count?: boolean; className?: string }) {
  if (count && typeof children === 'number') {
    return <CountingFigure value={children} className={className} />;
  }
  return <span className={`ui-figure ${className}`}>{children}</span>;
}

function CountingFigure({ value, className }: { value: number; className: string }) {
  const counting = useCountUp<HTMLSpanElement>(value, { delay: 220 });
  /*
   * The final value is what a screen reader is given, and what a copy-paste picks up: the count is
   * a visual event, not a change in what the number is. Announcing every frame of it would be
   * unreadable, which is what `aria-hidden` on the moving half is for. Both halves render the real
   * number, so the server's markup and a client with no JavaScript are simply correct.
   *
   * Two halves means the number is in the document twice, and a selection dragged across it was
   * taking both — "4개" copied as "44개". `primitives.css` keeps the moving half out of the
   * selection, which leaves the settled `.sr-only` copy as the one thing on the clipboard.
   */
  return (
    <span className={`ui-figure ${className}`}>
      <span ref={counting} aria-hidden="true">{value}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

/**
 * Title over a grey sub-line, centred by default.
 *
 * This is what replaced the tracked-out 11px uppercase eyebrow that used to sit
 * above every section. `eyebrow` survives for the few places that genuinely
 * need a category above the title, but it is now set in ordinary sentence type.
 */
export function SectionHeading({
  eyebrow,
  title,
  titleId,
  sub,
  align = 'center',
  as = 'h2',
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Names the section this heading opens, for a `<section aria-labelledby>`. */
  titleId?: string;
  sub?: ReactNode;
  align?: 'center' | 'start';
  as?: ElementType;
  className?: string;
}) {
  return (
    <div className={`ui-section-heading ${align === 'center' ? 'center' : ''} ${className}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <H2 as={as} id={titleId}>{title}</H2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}
