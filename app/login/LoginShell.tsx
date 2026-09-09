import type { ReactNode } from 'react';

/**
 * The page around the sign-in card.
 *
 * The old screen was a 960px split panel: a dark blue slab of marketing copy
 * beside the form. It looked substantial on a desktop and collapsed to nothing
 * on a phone, where the whole left half was simply `display: none` — half the
 * design existed only for people on large screens.
 *
 * This is one centred column instead. The headline is the page's, not a panel's,
 * so it survives every width; the card underneath is the only thing that has to
 * hold a layout, and it is 400px wide at its widest.
 */
export default function LoginShell({ headline, sub, children, footnote }: {
  headline: ReactNode;
  sub: ReactNode;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-mesh" aria-hidden="true" />

      <header className="auth-brand">
        <span className="brand-mark" aria-hidden="true"><span>SS</span><b>U</b></span>
        <span>
          <strong>국제처 업무·인수인계</strong>
          <small>SOONGSIL GLOBAL AFFAIRS</small>
        </span>
      </header>

      <div className="auth-column">
        <div className="auth-intro">
          <h1 className="ui-display">{headline}</h1>
          <p className="ui-text lg muted">{sub}</p>
        </div>

        {children}

        {footnote && <p className="auth-footnote">{footnote}</p>}
      </div>

      <footer className="auth-footer">
        <span>© 2026 GLOBAL AFFAIRS OFFICE</span>
        <span>교직원 전용 시스템</span>
      </footer>
    </main>
  );
}
