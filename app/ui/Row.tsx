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
}: RowProps & { onClick: () => void; ariaLabel?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`ui-row ${tone === 'plain' ? 'plain' : ''} ${className}`}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
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
