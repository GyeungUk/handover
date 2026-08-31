import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Swaps the label for a spinner and blocks the click, keeping the width. */
  busy?: boolean;
  busyLabel?: string;
  /** Trailing glyph — the "→" on a call to action. Leans in on hover. */
  glyph?: ReactNode;
  leading?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * Every button in the product.
 *
 * `busy` exists because the old screens each spelled out `{saving ? '저장 중…' :
 * '저장'}` at the call site, which meant the disabled state, the label and the
 * width all drifted apart from screen to screen.
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  busy = false,
  busyLabel,
  glyph,
  leading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-btn ${variant} ${size} ${block ? 'block' : ''} ${busy ? 'busy' : ''} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? (
        <>
          <span className="ui-spinner" aria-hidden="true" />
          {busyLabel ?? children}
        </>
      ) : (
        <>
          {leading}
          {children}
          {glyph && <span className="ui-btn-glyph" aria-hidden="true">{glyph}</span>}
        </>
      )}
    </button>
  );
}
