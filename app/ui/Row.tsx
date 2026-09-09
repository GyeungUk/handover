import type { CSSProperties, ReactNode } from 'react';

type RowProps = {
  /** Primary line. */
  title: ReactNode;
  /** Secondary line, one line, ellipsised. */
  sub?: ReactNode;
  /** Avatar, dot or icon on the left. */
  leading?: ReactNode;
  /** Badge or figure before the chevron. */
  trailing?: ReactNode;
  /** Replaces the "›". Pass `null` for none. */
  chevron?: ReactNode;
  tone?: 'default' | 'plain';
  className?: string;
  style?: CSSProperties;
};

/**
 * The reference's dominant affordance: a quiet surface, a label, a chevron.
 *
 * Search results, agenda entries, member lists, draft suggestions, part
 * navigation and the profile menu all reduce to this. That is the point — the
 * old screens each invented their own row, so the same gesture looked different
 * six times and only some of them were real buttons.
 */
export default function Row({
  onClick,
  ariaLabel,
  disabled,
  title,
  sub,
  leading,
  trailing,
  chevron = '›',
  tone = 'default',
  className = '',
  style,
  id,
  role,
  selected,
}: RowProps & {
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  /* A row inside a listbox is an option, and the box that owns it points at the
     one currently chosen by `aria-activedescendant` — which needs an id here.
     Search is the only caller so far; every other list leaves all three unset
     and renders exactly the plain button it always did. */
  id?: string;
  role?: 'option';
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role={role}
      aria-selected={role === 'option' ? Boolean(selected) : undefined}
      className={`ui-row ${tone === 'plain' ? 'plain' : ''} ${selected ? 'is-active' : ''} ${className}`}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      /* Keyboard drives this list from the input above it; a row must not become
         a tab stop of its own or Tab would walk twenty options. */
      tabIndex={role === 'option' ? -1 : undefined}
    >
      {leading}
      <span className="ui-row-body">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {trailing}
      {chevron && <span className="ui-row-chevron" aria-hidden="true">{chevron}</span>}
    </button>
  );
}

/** The same shape with nothing to press — a read-only detail line. */
export function StaticRow({ title, sub, leading, trailing, tone = 'default', className = '', style }: RowProps) {
  return (
    <div className={`ui-row static ${tone === 'plain' ? 'plain' : ''} ${className}`} style={style}>
      {leading}
      <span className="ui-row-body">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {trailing}
    </div>
  );
}

/**
 * A stack of rows. `divided` collapses the gap and puts hairlines between them
 * instead — for a list inside a card, where the outer card already provides the
 * separation.
 */
export function RowGroup({ divided = false, className = '', children }: { divided?: boolean; className?: string; children: ReactNode }) {
  return <div className={`ui-row-group ${divided ? 'divided' : ''} ${className}`}>{children}</div>;
}
