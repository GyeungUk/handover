/** Formatting and sanitising helpers shared by the editor, the reader and the save loop. */

import type { HandoverEntry, WorkBundle } from '../handover-schema';

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(name: string) {
  const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return extension ? extension.slice(0, 4).toUpperCase() : 'FILE';
}

export function plainText(html: string) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const richTextTags = new Set([
  'P', 'BR', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
]);
const dropWholeTag = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH']);

/** Keeps stored rich text useful while preventing pasted attributes or tags from executing. */
export function sanitizeRichHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const element of [...template.content.querySelectorAll('*')]) {
    if (dropWholeTag.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!richTextTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const safeStyles: string[] = [];
    for (const declaration of element.getAttribute('style')?.split(';') ?? []) {
      const [rawProperty, ...rawValue] = declaration.split(':');
      const property = rawProperty?.trim().toLowerCase();
      const value = rawValue.join(':').trim().toLowerCase();
      if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) {
        safeStyles.push(`text-align:${value}`);
      }
      if (property === 'background-color'
          && (/^#[0-9a-f]{3,8}$/.test(value) || /^rgba?\([\d\s,.%]+\)$/.test(value))) {
        safeStyles.push(`background-color:${value}`);
      }
    }
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (safeStyles.length) element.setAttribute('style', safeStyles.join(';'));
  }
  return template.innerHTML.trim();
}

/**
 * A stable fingerprint of the document as the server would store it.
 *
 * Comparing fingerprints is what keeps the autosave quiet: object-URL churn, property key order and
 * cleared property values all change the React state without changing anything worth writing.
 */
export function snapshotOf(entries: HandoverEntry[], bundles: WorkBundle[]) {
  return JSON.stringify({
    entries: entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title.trim(),
      detail: entry.detail.trim(),
      properties: Object.entries(entry.properties).filter(([, value]) => value.trim()).sort(([a], [b]) => a.localeCompare(b)),
      attachments: entry.attachments.map((file) => [file.id, file.name, file.size, file.type]),
      formatting: [entry.formatting.fontFamily, entry.formatting.fontSize],
    })),
    bundles: bundles.map((bundle) => [bundle.id, bundle.title.trim(), bundle.entryIds]),
  });
}

/** The body of a save: reviewer verdicts are left out, because only a review may set them. */
export function savePayload(entries: HandoverEntry[], bundles: WorkBundle[]) {
  return JSON.stringify({ entries, bundles: bundles.map((bundle) => ({ id: bundle.id, title: bundle.title, entryIds: bundle.entryIds })) });
}
