/**
 * The handover document as paper.
 *
 * The workspace screen is built for writing — steps, pickers, verdict controls — and none of that
 * belongs on the copy an author reads before submitting or a part leader keeps after approving.
 * So printing does not restyle the screen: it builds the document again as a self-contained sheet
 * and hands that to `printSheet`, which mounts it, isolates it from the app around it and calls the
 * browser's own print dialog — the place "PDF로 저장" lives on every platform this office uses.
 *
 * `../print-sheet` holds the part this shares with the year plan: the page box, the base face, the
 * scoping that lets a sheet's rules win against 6,000 lines of workspace CSS, and the mount /
 * print / clean-up cycle. What is left here is what a handover document says.
 */

import { categories } from './categories';
import { plainText, sanitizeRichHtml } from './format';
import { baseSheetStyles, escapeHtml, printSheet, standaloneDocument, type Sheet } from '../print-sheet';
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
 *
 * `__ROOT__` is the sheet itself and `__SCOPE__` prefixes everything inside it. Mounted in a
 * document of its own they resolve to `body` and to nothing; mounted in the workspace they both
 * resolve to the sheet's id, which is what makes these rules win against the app's stylesheet
 * without a single `!important`.
 */
const sheetStyles = `
  ${baseSheetStyles({ size: 'A4', margin: '18mm 15mm 16mm' })}
  __ROOT__ { font-size: 11pt; line-height: 1.65; }

  __SCOPE__ .cover { border-bottom: 2pt solid #14181d; padding-bottom: 10pt; margin-bottom: 14pt; }
  /* 0.02em, not 0.08em. This line is the organisation's Korean name, and wide
     tracking is a Latin device — on Hangul it does not open a word up, it
     spaces the syllable blocks apart until the name reads as a list of
     characters. The same correction the screen labels took. */
  __SCOPE__ .cover-kicker { font-size: 9.5pt; letter-spacing: 0.02em; color: #5b6673; margin-bottom: 4pt; }
  __SCOPE__ .cover h1 { font-size: 20pt; }
  __SCOPE__ .cover-year { font-size: 12pt; color: #1d5f92; font-weight: 600; margin-top: 3pt; }

  __SCOPE__ .facts { width: 100%; margin-bottom: 16pt; }
  __SCOPE__ .facts th, __SCOPE__ .facts td { border: 0.75pt solid #c8d0d9; padding: 5pt 8pt; font-size: 10pt; text-align: left; vertical-align: top; }
  __SCOPE__ .facts th { background: #f1f4f7; width: 20%; font-weight: 600; color: #3c4756; }

  __SCOPE__ .unit { margin-bottom: 18pt; break-inside: auto; }
  /*
   * A work unit opens a page of its own — that is what makes a printed handover navigable, and it
   * is the convention for this document in a Korean office.
   *
   * An empty one does not. An author who has made a unit and not filled it yet was getting a whole
   * sheet of A4 carrying one section number and the sentence "이 담당업무 단위에는 아직 항목이
   * 없습니다."; a document mid-composition with three of those printed three blank pages. The unit
   * still prints — the paper has to agree with the screen — it just no longer claims a page for it.
   */
  __SCOPE__ .unit + .unit { break-before: page; }
  __SCOPE__ .unit + .unit.is-empty { break-before: auto; }
  __SCOPE__ .unit.is-empty { margin-bottom: 14pt; }
  __SCOPE__ .unit-head {
    display: flex; align-items: baseline; gap: 8pt;
    border-left: 3pt solid #1d5f92; padding: 2pt 0 2pt 8pt; margin-bottom: 10pt;
    break-after: avoid;
  }
  __SCOPE__ .unit-head .index { font-size: 9.5pt; color: #5b6673; font-weight: 600; }
  __SCOPE__ .unit-head h2 { font-size: 14pt; }
  __SCOPE__ .unit-head .verdict { margin-left: auto; font-size: 9.5pt; font-weight: 600; }
  __SCOPE__ .verdict.approved { color: #1f7a70; }
  __SCOPE__ .verdict.rejected { color: #a0475c; }

  __SCOPE__ .comment { border: 0.75pt solid #e0c7ce; background: #fbf3f5; padding: 6pt 9pt; margin-bottom: 10pt; font-size: 10pt; }
  __SCOPE__ .comment b { display: block; color: #8d3a4e; margin-bottom: 2pt; }

  /*
   * An entry moves to the next page rather than splitting across two — that is the one thing that
   * makes a printed handover hard to read, and it is worth a little white space at a page foot.
   *
   * It stops being worth it when the entry is taller than a page. Such an entry has to break
   * somewhere, and "avoid" does not prevent that; it only makes the entry start on a fresh page
   * first, which strands most of the previous one. A thirty-paragraph 현안사항 was leaving sixty
   * percent of a sheet blank and then breaking anyway. "is-long" — decided by the builder, which
   * is the only place that knows how much text there is — lets those flow, and orphans/widows
   * make sure a break inside one never leaves a single line by itself.
   */
  __SCOPE__ .entry { break-inside: avoid; margin-bottom: 12pt; padding-bottom: 10pt; border-bottom: 0.5pt dashed #d5dbe2; }
  __SCOPE__ .entry.is-long { break-inside: auto; }
  __SCOPE__ .entry-body p, __SCOPE__ .entry-body li { orphans: 2; widows: 2; }
  __SCOPE__ .entry:last-child { border-bottom: 0; }
  __SCOPE__ .entry-head { break-after: avoid; margin-bottom: 5pt; }
  __SCOPE__ .entry-section { font-size: 9pt; font-weight: 700; color: #1d5f92; letter-spacing: 0.02em; }
  __SCOPE__ .entry h3 { font-size: 12pt; margin-top: 2pt; }
  __SCOPE__ .entry-properties { margin: 5pt 0 7pt; font-size: 9.5pt; color: #3c4756; }
  __SCOPE__ .entry-properties span { display: inline-block; margin-right: 12pt; }
  __SCOPE__ .entry-properties b { color: #5b6673; font-weight: 600; margin-right: 4pt; }
  __SCOPE__ .entry-body { font-size: 10.5pt; }
  __SCOPE__ .entry-body p { margin: 0 0 5pt; }
  __SCOPE__ .entry-body strong { color: #14181d; }
  __SCOPE__ .entry-body ul, __SCOPE__ .entry-body ol { margin: 0 0 5pt; padding-left: 16pt; }
  __SCOPE__ .entry-body li { margin: 0 0 2pt; }
  __SCOPE__ .entry-body table { width: 100%; margin: 4pt 0 6pt; font-size: 9.5pt; }
  __SCOPE__ .entry-body th, __SCOPE__ .entry-body td { border: 0.5pt solid #c8d0d9; padding: 3pt 5pt; }
  __SCOPE__ .entry-body img { max-width: 100%; }
  __SCOPE__ .attachments { margin-top: 5pt; font-size: 9.5pt; color: #5b6673; }
  __SCOPE__ .attachments b { font-weight: 600; margin-right: 4pt; }

  __SCOPE__ .empty { font-size: 10pt; color: #5b6673; font-style: italic; }
  __SCOPE__ .sheet-foot { margin-top: 16pt; padding-top: 8pt; border-top: 0.5pt solid #c8d0d9; font-size: 9pt; color: #5b6673; }
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

/*
 * Roughly how much text fits on one A4 page of this sheet: 11pt body at 1.65 leading over a
 * 263mm × 180mm text area is about forty lines, and a Korean line at that measure runs to around
 * fifty characters. It does not have to be exact — it only has to separate "this will fit on a
 * page" from "this cannot", and everything near the boundary is fine either way.
 */
const PAGE_OF_TEXT = 1_800;

function entrySheet(entry: HandoverEntry, label: string) {
  /* The body is stored HTML. It was sanitised on the way in, and it is sanitised again here
     because an archived year is read straight off the API rather than through the editor. */
  const body = sanitizeRichHtml(entry.detail) || '<p class="empty">본문이 비어 있습니다.</p>';
  const long = plainText(entry.detail).length > PAGE_OF_TEXT;
  return `<article class="entry${long ? ' is-long' : ''}">
    <div class="entry-head">
      <div class="entry-section">${escapeHtml(label)}</div>
      <h3>${escapeHtml(entry.title)}</h3>
    </div>
    ${propertyLine(entry)}
    <div class="entry-body">${body}</div>
    ${attachmentLine(entry)}
  </article>`;
}

/**
 * Everything inside the sheet — the cover, the facts table, the units — with no `<html>` around it.
 *
 * Exported so both mounts build from one function: the standalone document wraps this, and the
 * in-page sheet sets it as the mounted element's `innerHTML`.
 */
export function buildSheetBody(document: HandoverDocument, meta: PrintMeta) {
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
    return `<section class="unit${bundleEntries.length ? '' : ' is-empty'}">
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

  return `<header class="cover">
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

  <footer class="sheet-foot">${escapeHtml(organization)} 업무 인수인계 워크스페이스에서 출력 · ${escapeHtml(onDate(new Date().toISOString()))}</footer>`;
}

/** The document as a printable sheet: what it is called, how it is set, and what is on it. */
function handoverSheet(handover: HandoverDocument, meta: PrintMeta): Sheet {
  return {
    title: `${meta.academicYearLabel} 업무 인수인계서 - ${handover.ownerName || '작성자'}`,
    styles: sheetStyles,
    body: buildSheetBody(handover, meta),
  };
}

/** The whole sheet, as one standalone HTML document. Exported so it can be tested and previewed. */
export function buildPrintHtml(handover: HandoverDocument, meta: PrintMeta) {
  return standaloneDocument(handoverSheet(handover, meta));
}

/** Hands the document to the browser's print dialog, where the reader saves it as PDF. */
export function printHandoverDocument(handover: HandoverDocument, meta: PrintMeta) {
  printSheet(handoverSheet(handover, meta));
}
