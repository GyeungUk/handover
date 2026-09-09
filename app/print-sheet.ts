/**
 * Putting a sheet of paper in front of the browser's print dialog.
 *
 * The workspace has two things worth printing — a handover document and a year plan — and neither
 * of them is the screen they are read on. Both are rebuilt as a self-contained sheet and handed to
 * the browser, which is where "PDF로 저장" lives on every platform this office uses. What is here is
 * the part they share: mounting the sheet, isolating it from the app around it, printing it, and
 * taking it out again.
 *
 * ## Why the sheet is printed in the page rather than from an iframe
 *
 * Printing used to render into a hidden, zero-sized `<iframe srcdoc>` and call `print()` on that
 * frame's window. On a desktop browser that works. On a phone it does not, and a phone is where
 * most of this office reads a handover:
 *
 *   - iOS Safari has no per-frame print. `frame.contentWindow.print()` prints the *top* document,
 *     so the reader got the workspace — top bar, stepper, cards — instead of the document, or a
 *     blank sheet, depending on the iOS version.
 *   - The frame was `visibility: hidden` at `0x0`. Several mobile engines lay out and paginate the
 *     frame at its box size, and a zero-height box paginates to nothing.
 *
 * Printing the page itself has neither problem, because `window.print()` is the one printing entry
 * point every engine implements the same way. What it costs is isolation: the workspace's own
 * 6,000 lines of CSS are in the document. That is paid for twice over —
 *
 *   1. a sheet's rules are written against `__SCOPE__`, which becomes an id selector, so a sheet
 *      rule outranks anything the workspace states by class or by element name; and
 *   2. `@media print` hides every sibling of the sheet outright, so nothing else can print.
 *
 * The same style string builds the standalone document `standaloneDocument` returns, which is what
 * the tests read — one description of the paper, two ways of mounting it.
 */

/** The element a sheet is mounted as, and the id every scoped rule hangs off. */
const SHEET_ID = 'ho-print-sheet';
const STYLE_ID = 'ho-print-style';
let releaseActiveSheet: (() => void) | undefined;

export const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/**
 * What every sheet in the product shares before it says anything of its own: the page box, the
 * face, the leading, and the rule that a heading never ends a page on its own.
 *
 * `__ROOT__` is the sheet itself and `__SCOPE__` prefixes everything inside it, so the same string
 * works mounted in a document of its own and mounted inside the workspace.
 */
export const baseSheetStyles = (page: { size: string; margin: string }) => `
  @page { size: ${page.size}; margin: ${page.margin}; }
  __SCOPE__ * { box-sizing: border-box; }
  __ROOT__ {
    margin: 0;
    font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    line-height: 1.6;
    color: #14181d;
    background: #fff;
    text-align: left;
    letter-spacing: normal;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  __SCOPE__ h1, __SCOPE__ h2, __SCOPE__ h3, __SCOPE__ h4 {
    margin: 0;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.35;
    break-after: avoid;
  }
  __SCOPE__ p { margin: 0 0 6pt; }
  __SCOPE__ table { border-collapse: collapse; }
  __SCOPE__ .sheet-foot { margin-top: 14pt; padding-top: 8pt; border-top: 0.5pt solid #c8d0d9; font-size: 9pt; color: #5b6673; }
  __SCOPE__ .empty { font-size: 10pt; color: #5b6673; font-style: italic; }
`;

/** A sheet's rules as a document of its own — `body` is the sheet, nothing needs prefixing. */
const asStandalone = (styles: string) => styles
  .replaceAll('__ROOT__', 'body')
  .replaceAll('__SCOPE__ ', '')
  .replaceAll('__SCOPE__', 'body');

/**
 * A sheet's rules for a sheet mounted inside the workspace.
 *
 * Every selector is prefixed with the sheet's id, so it beats the app's own class rules; and the
 * two `@media` blocks decide, in each direction, who is on the paper and who is on the screen.
 */
const asScoped = (styles: string) => `
  ${styles.replaceAll('__ROOT__', `#${SHEET_ID}`).replaceAll('__SCOPE__', `#${SHEET_ID}`)}

  /* Off-screen entirely until the print dialog opens. */
  @media screen { #${SHEET_ID} { display: none !important; } }

  @media print {
    /* Nothing but the sheet reaches the paper — no top bar, no sheet-modal, no toast. */
    html > body > *:not(#${SHEET_ID}) { display: none !important; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      /* the workspace pins its own height and hides overflow; both truncate the print to one page */
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
    }
    #${SHEET_ID} { display: block !important; }
  }
`;

/** One printable document: what it is called, how it is styled, and what is on it. */
export type Sheet = {
  /** seeds the saved PDF's filename, because every browser takes it from `document.title` */
  title: string;
  /** the sheet's own rules, written against `__ROOT__` / `__SCOPE__` */
  styles: string;
  /** the sheet's markup, with no `<html>` around it */
  body: string;
};

/** The sheet as one standalone HTML document. Exported so it can be tested and previewed. */
export function standaloneDocument(sheet: Sheet) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheet.title)}</title>
<style>${asStandalone(sheet.styles)}</style>
</head>
<body>
  ${sheet.body}
</body>
</html>`;
}

/**
 * Hands a sheet to the browser's print dialog, where the reader saves it as PDF.
 *
 * The sheet and its stylesheet are mounted into the live page, printed, and taken out again. The
 * document title goes with them: every browser seeds the PDF's filename from `document.title`, so
 * without this the file a reader saves on their phone is called "국제처 업무·인수인계 | 숭실대학교".
 *
 * Clean up after the print dialog closes or the page is left. Some mobile browsers omit
 * `afterprint`, so also watch print media changes. If neither signal arrives, keep one hidden
 * sheet until the next print. A timeout must not remove a document while someone is still
 * choosing their printer or PDF destination.
 */
export function printSheet(sheet: Sheet) {
  const host = window.document;
  releaseActiveSheet?.();
  /* A second press while a dialog is still open would otherwise print two sheets. */
  host.getElementById(SHEET_ID)?.remove();
  host.getElementById(STYLE_ID)?.remove();

  const style = host.createElement('style');
  style.id = STYLE_ID;
  style.textContent = asScoped(sheet.styles);

  const mounted = host.createElement('div');
  mounted.id = SHEET_ID;
  /* Not part of the page being read: it exists for the printer and for nobody's screen reader. */
  mounted.setAttribute('aria-hidden', 'true');
  mounted.innerHTML = sheet.body;

  host.head.appendChild(style);
  host.body.appendChild(mounted);

  const previousTitle = host.title;
  host.title = sheet.title;

  let done = false;
  let frame = 0;
  const printMedia = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
  const cleanUp = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', cleanUp);
    window.removeEventListener('pagehide', cleanUp);
    printMedia?.removeEventListener?.('change', onMediaChange);
    window.cancelAnimationFrame(frame);
    host.title = previousTitle;
    mounted.remove();
    style.remove();
    if (releaseActiveSheet === cleanUp) releaseActiveSheet = undefined;
  };
  function onMediaChange(event: MediaQueryListEvent) {
    if (!event.matches) cleanUp();
  }

  window.addEventListener('afterprint', cleanUp);
  window.addEventListener('pagehide', cleanUp);
  printMedia?.addEventListener?.('change', onMediaChange);
  releaseActiveSheet = cleanUp;

  /* One frame, so the browser has laid the sheet out before it is asked to paginate it. */
  frame = window.requestAnimationFrame(() => {
    try {
      window.print();
    } catch (error) {
      cleanUp();
      throw error;
    }
  });
}
