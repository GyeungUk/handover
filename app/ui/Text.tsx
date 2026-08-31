import type { ElementType, ReactNode } from 'react';

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

export function H2({ as: Tag = 'h2', children, className = '' }: { as?: ElementType; children: ReactNode; className?: string }) {
  return <Tag className={`ui-h2 ${className}`}>{children}</Tag>;
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
export function Figure({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ui-figure ${className}`}>{children}</span>;
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
  sub,
  align = 'center',
  as = 'h2',
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  align?: 'center' | 'start';
  as?: ElementType;
  className?: string;
}) {
  return (
    <div className={`ui-section-heading ${align === 'center' ? 'center' : ''} ${className}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <H2 as={as}>{title}</H2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}
