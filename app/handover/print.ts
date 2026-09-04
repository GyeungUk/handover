/**
 * The handover document as paper.
 *
 * The workspace screen is built for writing — steps, pickers, verdict controls — and none of that
 * belongs on the copy an author reads before submitting or a part leader keeps after approving.
 * So printing does not restyle the screen: it builds the document again as a self-contained page
 * and hands that to the browser's own print dialog, which is where "PDF로 저장" lives on every
 * platform the office uses.
 *
 * Rendering into an isolated iframe rather than a new window is deliberate. A popup is blocked
 * often enough to be unreliable, and printing the current page would drag 5,000 lines of workspace
 * CSS in with it; a same-origin iframe has neither problem, and it prints without the reader ever
 * seeing a second tab open and close.
 */

import { categories } from './categories';
import { sanitizeRichHtml } from './format';
import {
  handoverCategoryLabels,
  propertyFieldsByCategory,
  type HandoverDocument,
  type HandoverEntry,
  type WorkflowStatus,
} from '../handover-schema';

/** What the cover page says about the document, which the document itself does not carry. */
export type PrintMeta = {
  /** e.g. "2026학년도" — the year this document belongs to, not today's year. */
  academicYearLabel: string;
  /** shown under the title; the office this workspace serves */
  organization?: string;
  /** set when printing a closed year, so the sheet says it is a record rather than a live draft */
  archived?: boolean;
};

const statusLabels: Record<WorkflowStatus, string> = {
  draft: '작성 중',
  pending: '파트장 검토 대기',
  rejected: '보완 요청됨',
  approved: '승인 완료',
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const onDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  : '—';

/**
 * The stylesheet the printed sheet carries with it.
 *
 * Sized for A4 in a Korean office document: 11pt body, generous leading, and every rule about
 * where a page may break stated here rather than left to the browser. An entry that splits across
 * two pages is the one failure that makes a printed handover hard to read, so entries and their
 * headings are kept together and a work unit always opens a page of its own.
 */
const sheetStyles = `
  @page { size: A4; margin: 18mm 15mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    font-size: 11pt;
    line-height: 1.65;
    color: #14181d;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3, h4 { margin: 0; font-weight: 700; }
  p { margin: 0 0 6pt; }

  .cover { border-bottom: 2pt solid #14181d; padding-bottom: 10pt; margin-bottom: 14pt; }
  .cover-kicker { font-size: 9.5pt; letter-spacing: 0.08em; color: #5b6673; margin-bottom: 4pt; }
  .cover h1 { font-size: 20pt; letter-spacing: -0.01em; }
  .cover-year { font-size: 12pt; color: #1d5f92; font-weight: 600; margin-top: 3pt; }

  .facts { width: 100%; border-collapse: collapse; margin-bottom: 16pt; }
  .facts th, .facts td { border: 0.75pt solid #c8d0d9; padding: 5pt 8pt; font-size: 10pt; text-align: left; }
  .facts th { background: #f1f4f7; width: 20%; font-weight: 600; color: #3c4756; }

  .unit { margin-bottom: 18pt; break-inside: auto; }
  .unit + .unit { break-before: page; }
  .unit-head {
    display: flex; align-items: baseline; gap: 8pt;
    border-left: 3pt solid #1d5f92; padding: 2pt 0 2pt 8pt; margin-bottom: 10pt;
    break-after: avoid;
  }
  .unit-head .index { font-size: 9.5pt; color: #5b6673; font-weight: 600; }
  .unit-head h2 { font-size: 14pt; }
  .unit-head .verdict { margin-left: auto; font-size: 9.5pt; font-weight: 600; }
  .verdict.approved { color: #1f7a70; }
  .verdict.rejected { color: #a0475c; }

  .comment { border: 0.75pt solid #e0c7ce; background: #fbf3f5; padding: 6pt 9pt; margin-bottom: 10pt; font-size: 10pt; }
  .comment b { display: block; color: #8d3a4e; margin-bottom: 2pt; }

  .entry { break-inside: avoid; margin-bottom: 12pt; padding-bottom: 10pt; border-bottom: 0.5pt dashed #d5dbe2; }
  .entry:last-child { border-bottom: 0; }
  .entry-head { break-after: avoid; margin-bottom: 5pt; }
  .entry-section { font-size: 9pt; font-weight: 700; color: #1d5f92; letter-spacing: 0.02em; }
  .entry h3 { font-size: 12pt; margin-top: 2pt; }
  .entry-properties { margin: 5pt 0 7pt; font-size: 9.5pt; color: #3c4756; }
  .entry-properties span { display: inline-block; margin-right: 12pt; }
  .entry-properties b { color: #5b6673; font-weight: 600; margin-right: 4pt; }
  .entry-body { font-size: 10.5pt; }
  .entry-body p { margin: 0 0 5pt; }
  .entry-body strong { color: #14181d; }
  .entry-body ul, .entry-body ol { margin: 0 0 5pt; padding-left: 16pt; }
  .entry-body table { border-collapse: collapse; width: 100%; margin: 4pt 0 6pt; font-size: 9.5pt; }
  .entry-body th, .entry-body td { border: 0.5pt solid #c8d0d9; padding: 3pt 5pt; }
  .attachments { margin-top: 5pt; font-size: 9.5pt; color: #5b6673; }
  .attachments b { font-weight: 600; margin-right: 4pt; }

  .empty { font-size: 10pt; color: #5b6673; font-style: italic; }
  .sheet-foot { margin-top: 16pt; padding-top: 8pt; border-top: 0.5pt solid #c8d0d9; font-size: 9pt; color: #5b6673; }
`;

function propertyLine(entry: HandoverEntry) {
  const fields = propertyFieldsByCategory[entry.category] ?? [];
  const filled = fields
    .filter((field) => entry.properties[field.key])
    .map((field) => `<span><b>${escapeHtml(field.label)}</b>${escapeHtml(entry.properties[field.key])}</span>`);
  return filled.length ? `<div class="entry-properties">${filled.join('')}</div>` : '';
}

function attachmentLine(entry: HandoverEntry) {
  if (!entry.attachments.length) return '';
  const names = entry.attachments.map((file) => escapeHtml(file.name)).join(', ');
  return `<p class="attachments"><b>첨부</b>${names}</p>`;
}

function entrySheet(entry: HandoverEntry, label: string) {
  /* The body is stored HTML. It was sanitised on the way in, and it is sanitised again here
     because an archived year is read straight off the API rather than through the editor. */
  const body = sanitizeRichHtml(entry.detail) || '<p class="empty">본문이 비어 있습니다.</p>';
  return `<article class="entry">
    <div class="entry-head">
      <div class="entry-section">${escapeHtml(label)}</div>
      <h3>${escapeHtml(entry.title)}</h3>
    </div>
    ${propertyLine(entry)}
    <div class="entry-body">${body}</div>
    ${attachmentLine(entry)}
  </article>`;
}

/** The whole sheet, as one standalone HTML document. Exported so it can be tested and previewed. */
export function buildPrintHtml(document: HandoverDocument, meta: PrintMeta) {
  const organization = meta.organization ?? '국제처';
  const byId = new Map(document.entries.map((entry) => [entry.id, entry]));
  const placed = new Set(document.bundles.flatMap((bundle) => bundle.entryIds));
  const loose = document.entries.filter((entry) => !placed.has(entry.id));

  const units = document.bundles.map((bundle, index) => {
    const bundleEntries = bundle.entryIds
      .map((entryId) => byId.get(entryId))
      .filter((entry): entry is HandoverEntry => Boolean(entry));
    const verdict = bundle.decision
      ? `<span class="verdict ${bundle.decision}">${bundle.decision === 'approved' ? '승인' : '반려'}</span>`
      : '';
    /* The reviewer's request is part of the record of a unit that came back, so it prints with it. */
    const comment = bundle.decision === 'rejected' && bundle.comment
      ? `<div class="comment"><b>파트장 보완 요청</b>${escapeHtml(bundle.comment)}</div>`
      : '';
    const body = bundleEntries.length
      ? bundleEntries.map((entry) => entrySheet(entry, handoverCategoryLabels[entry.category])).join('')
      : '<p class="empty">이 담당업무 단위에는 아직 항목이 없습니다.</p>';
    return `<section class="unit">
      <div class="unit-head">
        <span class="index">A-${String(index + 1).padStart(2, '0')}</span>
        <h2>${escapeHtml(bundle.title || '이름 없는 담당업무 단위')}</h2>
        ${verdict}
      </div>
      ${comment}
      ${body}
    </section>`;
  }).join('');

  /* An unplaced entry is written work the author has not filed yet. Dropping it from the printout
     would make the paper disagree with the screen, so it prints last under its own heading. */
  const unplaced = loose.length
    ? `<section class="unit">
        <div class="unit-head"><span class="index">기타</span><h2>업무 단위에 배치되지 않은 항목</h2></div>
        ${loose.map((entry) => entrySheet(entry, handoverCategoryLabels[entry.category])).join('')}
      </section>`
    : '';

  /* Only the sections this document actually used: "계획 및 진행 0" is noise on a cover sheet. */
  const counts = categories
    .map((category) => ({
      short: category.short,
      count: document.entries.filter((entry) => entry.category === category.id).length,
    }))
    .filter((section) => section.count > 0)
    .map((section) => `${section.short} ${section.count}`)
    .join(' · ');

  const title = `${meta.academicYearLabel} 업무 인수인계서 - ${document.ownerName || '작성자'}`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${sheetStyles}</style>
</head>
<body>
  <header class="cover">
    <div class="cover-kicker">${escapeHtml(organization)}${meta.archived ? ' · 연도별 보관 기록' : ''}</div>
    <h1>업무 인수인계서</h1>
    <div class="cover-year">${escapeHtml(meta.academicYearLabel)}</div>
  </header>

  <table class="facts">
    <tbody>
      <tr><th>작성자</th><td>${escapeHtml(document.ownerName || '—')}</td><th>소속</th><td>${escapeHtml(organization)}</td></tr>
      <tr><th>진행 상태</th><td>${escapeHtml(statusLabels[document.status])}</td><th>제출일</th><td>${escapeHtml(onDate(document.submittedAt))}</td></tr>
      <tr><th>검토자</th><td>${escapeHtml(document.reviewedBy || '—')}</td><th>검토일</th><td>${escapeHtml(onDate(document.reviewedAt))}</td></tr>
      <tr><th>구성</th><td colspan="3">담당업무 단위 ${document.bundles.length}개 · 전체 항목 ${document.entries.length}개${counts ? ` (${escapeHtml(counts)})` : ''}</td></tr>
    </tbody>
  </table>

  ${units || '<p class="empty">작성된 담당업무 단위가 없습니다.</p>'}
  ${unplaced}

  <footer class="sheet-foot">${escapeHtml(organization)} 업무 인수인계 워크스페이스에서 출력 · ${escapeHtml(onDate(new Date().toISOString()))}</footer>
</body>
</html>`;
}

/**
 * Hands the sheet to the browser's print dialog, where the reader saves it as PDF.
 *
 * The iframe is removed once printing has been dismissed. Chrome and Safari fire `afterprint` on
 * the iframe's own window; the timer is there for the browsers that do not, so a dialog the reader
 * leaves open for a while never leaves an orphan node behind either way.
 */
export function printHandoverDocument(handover: HandoverDocument, meta: PrintMeta) {
  const frame = window.document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', '인수인계서 인쇄');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = buildPrintHtml(handover, meta);

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      frame.remove();
      return;
    }
    let removed = false;
    const cleanUp = () => {
      if (removed) return;
      removed = true;
      window.setTimeout(() => frame.remove(), 0);
    };
    view.addEventListener('afterprint', cleanUp);
    window.setTimeout(cleanUp, 60000);
    view.focus();
    view.print();
  };

  window.document.body.appendChild(frame);
}
