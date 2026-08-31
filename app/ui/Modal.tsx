'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export type ModalWidth = 'sm' | 'md' | 'lg' | 'xl';

/** Everything focusable, in document order, minus the things that opt out. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How many dialogs are open. Nested ones must not each undo the scroll lock. */
let openCount = 0;

/**
 * The one dialog.
 *
 * The product had six hand-rolled ones. Between them they implemented Escape
 * once, a focus trap never, and the background scroll lock never — so opening a
 * modal on a phone scrolled the page underneath it, and tabbing walked straight
 * out of the dialog into the page behind. All of that is here instead:
 *
 * - Escape closes, unless `dismissable` is off (a save is in flight)
 * - focus moves in on open and returns to the opener on close
 * - Tab and Shift+Tab cycle inside
 * - the body cannot scroll behind it, counted so nesting works
 * - `mousedown` rather than `click` on the backdrop, so releasing a drag that
 *   started inside the dialog does not dismiss it
 *
 * Under 768px `primitives.css` turns it into a bottom sheet. Nothing here
 * changes for that — it is the same tree.
 */
export default function Modal({
  onClose,
  title,
  description,
  width = 'md',
  dismissable = true,
  labelledBy,
  head,
  footer,
  stackFooter = false,
  initialFocus = 'first',
  className = '',
  children,
}: {
  onClose: () => void;
  /** Rendered as the dialog's heading and used as its accessible name. */
  title?: ReactNode;
  description?: ReactNode;
  width?: ModalWidth;
  /** False while something irreversible is in flight. */
  dismissable?: boolean;
  /** Supply when the heading is drawn by `head` instead of `title`. */
  labelledBy?: string;
  /** Replaces the default title block entirely. */
  head?: ReactNode;
  footer?: ReactNode;
  /** Stack the footer's buttons full-width in sheet mode. */
  stackFooter?: boolean;
  /** Keep long read-first dialogs at their top instead of scrolling to a lower control. */
  initialFocus?: 'first' | 'dialog';
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = labelledBy ?? `${generatedId}-title`;

  /* Focus in, focus back out. The opener is read before the dialog paints, so
     the button that was clicked is what gets focus again on close.

     Focus normally goes to the first focusable thing in the *body*, not in the
     dialog. Long, read-first dialogs may opt into focusing the dialog itself so
     the browser does not scroll their opening context out of view. The head
     holds the close button, so taking the first focusable overall put the caret
     on "dismiss" in every dialog with a custom head — including the entry
     editor, whose first field is the one you opened it to fill in.
     (Checking for an `autoFocus` attribute does not work: React applies it
     imperatively and never writes it to the DOM.) */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    const body = node?.querySelector<HTMLElement>('.ui-modal-body');
    const wanted = initialFocus === 'dialog'
      ? node
      : body?.querySelector<HTMLElement>(FOCUSABLE) ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (wanted ?? node)?.focus();
    return () => opener?.focus?.();
  }, [initialFocus]);

  /* The page behind must not scroll. Counted, so closing an inner dialog does
     not release the lock the outer one still needs. */
  useEffect(() => {
    const { body } = document;
    if (openCount === 0) {
      const width = window.innerWidth - document.documentElement.clientWidth;
      body.dataset.uiScrollLock = body.style.overflow;
      body.style.overflow = 'hidden';
      /* compensate for the scrollbar the lock removes, or the page shifts */
      if (width > 0) body.style.paddingRight = `${width}px`;
    }
    openCount += 1;
    return () => {
      openCount -= 1;
      if (openCount === 0) {
        body.style.overflow = body.dataset.uiScrollLock ?? '';
        body.style.paddingRight = '';
        delete body.dataset.uiScrollLock;
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialog.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.offsetParent !== null || item === document.activeElement,
      );
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!node.contains(active)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dismissable, onClose]);

  return (
    <div
      className="ui-modal-backdrop"
      role="presentation"
      onMouseDown={() => dismissable && onClose()}
    >
      <div
        ref={dialog}
        className={`ui-modal w-${width} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title || labelledBy ? titleId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="ui-sheet-handle" aria-hidden="true" />
        {head ?? (title && (
          <header className="ui-modal-head">
            <div className="ui-modal-title">
              <h2 className="ui-h2" id={titleId}>{title}</h2>
              {description && <p className="ui-text sm muted">{description}</p>}
            </div>
            {dismissable && (
              <button className="ui-modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
            )}
          </header>
        ))}
        <div className="ui-modal-body">{children}</div>
        {footer && <footer className={`ui-modal-foot ${stackFooter ? 'stack' : ''}`}>{footer}</footer>}
      </div>
    </div>
  );
}
