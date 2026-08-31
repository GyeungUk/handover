import type { CSSProperties, ReactNode } from 'react';

export type CardTone = 'plain' | 'raised' | 'bordered' | 'flat' | 'tint' | 'brand';
export type CardPad = 'none' | 'sm' | 'md' | 'lg';

type BaseProps = {
  tone?: CardTone;
  pad?: CardPad;
  /** `--r-xl` instead of `--r-lg`, for panels that hold other cards. */
  xl?: boolean;
  /** Only meaningful with `tone="tint"`; any `--tint-*` token. */
  tint?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

const classesFor = ({ tone = 'plain', pad = 'md', xl = false, className = '' }: BaseProps) =>
  `ui-card ${tone === 'plain' ? '' : tone} ${pad === 'md' ? '' : `pad-${pad}`} ${xl ? 'xl' : ''} ${className}`;

/**
 * A surface. No border unless asked for — separation comes from the fill and
 * the radius, which is what keeps a page of twelve cards from reading as a
 * wireframe.
 */
export default function Card(props: BaseProps) {
  const { tint, style, children } = props;
  return (
    <div className={classesFor(props)} style={tint ? { ...style, '--tint': tint } as CSSProperties : style}>
      {children}
    </div>
  );
}

/**
 * The same surface, as a button.
 *
 * Kept separate rather than hidden behind an `onClick` prop so that a card that
 * responds to a click is always a real `<button>` — the old space cards were,
 * but the team strips and agenda rows were divs with handlers.
 */
export function CardButton({
  onClick,
  ariaLabel,
  disabled,
  ...props
}: BaseProps & { onClick: () => void; ariaLabel?: string; disabled?: boolean }) {
  const { tint, style, children } = props;
  return (
    <button
      type="button"
      className={`${classesFor(props)} interactive`}
      style={tint ? { ...style, '--tint': tint } as CSSProperties : style}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
