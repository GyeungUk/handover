import type { CSSProperties, ElementType, ReactNode } from 'react';

/* ==========================================================================
   Layout
   --------------------------------------------------------------------------
   Four primitives that between them replace almost every one-off flex/grid
   declaration in the product. Gaps come from the spacing scale, so vertical
   rhythm is consistent without every screen re-deciding it.
   ========================================================================== */

type Gap = 'sm' | 'md' | 'lg' | 'xl';

/** Vertical rhythm. */
export function Stack({
  as: Tag = 'div',
  gap = 'md',
  className = '',
  style,
  children,
}: { as?: ElementType; gap?: Gap; className?: string; style?: CSSProperties; children: ReactNode }) {
  return <Tag className={`ui-stack ${gap === 'md' ? '' : gap} ${className}`} style={style}>{children}</Tag>;
}

/** Horizontal grouping that wraps rather than overflows. */
export function Cluster({
  as: Tag = 'div',
  gap = 'md',
  between = false,
  className = '',
  style,
  children,
}: { as?: ElementType; gap?: 'sm' | 'md'; between?: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <Tag className={`ui-cluster ${gap === 'md' ? '' : gap} ${between ? 'between' : ''} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

/** Page width and side padding, both of which shrink with the viewport. */
export function Container({
  as: Tag = 'div',
  className = '',
  style,
  children,
}: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode }) {
  return <Tag className={`ui-container ${className}`} style={style}>{children}</Tag>;
}

/** A band of the page, carrying the responsive `--section-gap` above and below. */
export function Section({
  as: Tag = 'section',
  className = '',
  style,
  children,
  ...rest
}: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode; id?: string; 'aria-labelledby'?: string }) {
  return <Tag className={`ui-section ${className}`} style={style} {...rest}>{children}</Tag>;
}

export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`ui-divider ${className}`} />;
}

/**
 * Wide content scrolls inside its own box.
 *
 * This is the piece the workspace was missing: the calendar pages used to set
 * `min-width: 1000px` on the page itself, so a phone scrolled the entire
 * layout — header, breadcrumb and all — sideways. Anything genuinely wide goes
 * in here instead, and the page around it stays put.
 */
export function ScrollX({ className = '', style, children, label }: { className?: string; style?: CSSProperties; children: ReactNode; label?: string }) {
  return (
    <div className={`ui-scroll-x ${className}`} style={style} role={label ? 'region' : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      {children}
    </div>
  );
}
