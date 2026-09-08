/** Pulls text and table structure out of the office files people actually use for handovers. */

const textLike = /\.(txt|md|markdown|csv|tsv|json|htm|html|xml)$/i;
const hangulLike = /\.(hwp|hwpx|hwt|hwtx)$/i;
const spreadsheetLike = /\.(xls|xlsx|xlsm|xlsb|xlt|xltx|xltm)$/i;
const imageLike = /\.(png|jpe?g|webp)$/i;

export const acceptedImportTypes = [
  '.txt', '.md', '.csv', '.tsv', '.json', '.html', '.xml',
  '.docx', '.hwp', '.hwpx', '.pdf', '.png', '.jpg', '.jpeg', '.webp',
  '.xls', '.xlsx', '.xlsm',
].join(',');

export const supportedNote = 'TXT · DOCX · 한글(HWP/HWPX) · PDF · PNG/JPG · XLS/XLSX를 읽을 수 있습니다.';

/**
 * Every converter below hands back Markdown, and a slide deck comes out of one as a wall of
 * `###`, `**` and `►` with the words that carry the meaning buried between the markers. A model
 * asked to file that into sections has no prose to rewrite, so it copies the markers into the
 * title instead. Strip the syntax and keep the structure: a heading stays on its own line, a
 * table keeps its pipes, and the arrows a deck uses for sub-points become real list lines.
 */
export function tidyExtractedText(value: string) {
  const lines = value
    .replace(/\r\n?/g, '\n')
    /* A deck packs several sub-points onto one line behind arrows; each is its own line. */
    .replace(/[ \t]*[►▶]\s*/g, '\n- ')
    .split('\n');

  const cleaned = lines.map((raw) => {
    /* A table row carries its meaning in the pipes, so only the emphasis inside it is removed. */
    if (/^\s*\|.*\|\s*$/.test(raw)) return dropEmphasis(raw).trimEnd();
    /* Tabs are cell boundaries in a pasted spreadsheet. Keep empty cells as well as values. */
    if (raw.includes('\t')) return raw.split('\t').map((cell) => dropEmphasis(cell).trim()).join('\t');
    const line = dropEmphasis(raw
      .replace(/^\s{0,3}#{1,6}\s*/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*+•▪◦●○·・]\s+/, '- ')
      .replace(/^\s*[-*_=]{3,}\s*$/, ''))
      .replace(/[ \t]+/g, ' ')
      .trim();
    /* Bare numbers can be a deadline, count, or single-column table cell. Only remove an
       explicit page-number ornament; guessing from the number alone loses recorded facts. */
    return /^[-–]\s*\d{1,3}\s*[-–]$/.test(line) ? '' : line;
  });

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Markdown emphasis, code ticks, link syntax and the inline HTML tags the converters fall back on,
 * leaving the words they wrapped.
 *
 * <u> and its siblings are the damaging ones. A converter wraps whatever the author underlined,
 * and an author underlines through a word rather than around it, so a title page arrives as
 * `202<u>7-1학기 파견교환학생</u> 면접 일정`. Left in, the year no longer reads as 2027 anywhere:
 * a model that writes the year correctly then fails the backend's check that every number it used
 * appears in the source, and the one true item a timetable yields is thrown away. Only the tags
 * the @mdgate converters emit are listed, so a `<` a document actually contains survives.
 */
function dropEmphasis(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    /* A system/document URL is execution information, not disposable Markdown syntax. */
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, label, target) => label === target ? label : `${label} (${target})`)
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*+/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:u|s|i|b|em|strong|sub|sup|del|ins|mark)>/gi, '');
}

export async function extractText(file: File): Promise<string> {
  try {
    if (/\.docx$/i.test(file.name)) return await readDocx(file);
    if (hangulLike.test(file.name)) return await readHangul(file);
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return await readPdf(file);
    if (spreadsheetLike.test(file.name)) return await readSpreadsheet(file);
    if (imageLike.test(file.name) || /^image\/(png|jpeg|webp)$/i.test(file.type)) return await readImage(file);
    if (textLike.test(file.name) || file.type.startsWith('text/')) {
      const raw = await file.text();
      /* CSV/TSV/JSON/XML carry their own structure. Removing markup or normalising whitespace
         changes literal values, quoted multiline cells, and empty spreadsheet columns. */
      if (/\.(csv|tsv|json|xml)$/i.test(file.name) || /^(?:text\/(?:csv|tab-separated-values)|(?:text|application)\/xml)$/i.test(file.type)) {
        return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      }
      if (/\.(htm|html)$/i.test(file.name) || file.type === 'text/html') {
        return tidyExtractedText(decodeEntities(stripTags(raw)));
      }
      /* A literal <미제출> or an inequality in TXT/Markdown is document content, not HTML. */
      return tidyExtractedText(raw);
    }
  } catch (failure) {
    const detail = failure instanceof Error ? failure.message : '';
    if (/encrypt|password|암호/i.test(detail)) {
      throw new Error('암호가 걸린 파일은 읽을 수 없습니다. 암호를 해제한 후 다시 올려 주세요.');
    }
    throw new Error(detail || `${extensionOf(file)} 파일에서 내용을 읽지 못했습니다.`);
  }
  throw new Error(`${extensionOf(file)} 형식은 아직 자동으로 읽지 못합니다. 문서 내용을 복사해 아래에 붙여넣어 주세요.`);
}

async function readDocx(file: File) {
  const { toMarkdown } = await import('@mdgate/docx');
  return ensureReadable(await toMarkdown(await bytesOf(file)), '워드 문서');
}

async function readHangul(file: File) {
  const { toMarkdown } = await import('@mdgate/hwp');
  return ensureReadable(await toMarkdown(await bytesOf(file)), '한글 문서');
}

async function readPdf(file: File) {
  const { toMarkdown } = await import('@mdgate/pdf');
  return ensureReadable(
    await toMarkdown(await bytesOf(file)),
    'PDF',
    '스캔본 PDF라면 각 페이지를 PNG나 JPG로 올리면 한글 OCR로 읽을 수 있습니다.',
  );
}

async function readSpreadsheet(file: File) {
  const { toMarkdown } = await import('@mdgate/xlsx');
  return ensureReadable(await toMarkdown(await bytesOf(file)), '엑셀 문서');
}

async function readImage(file: File) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('kor+eng');
  try {
    const result = await worker.recognize(file);
    return ensureReadable(result.data.text, '이미지', '글자가 작거나 흐리면 더 큰 원본 이미지로 다시 올려 주세요.');
  } finally {
    await worker.terminate();
  }
}

const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

function ensureReadable(value: string, kind: string, hint = '') {
  const text = tidyExtractedText(value);
  if (text.length >= 30) return text;
  throw new Error(`${kind}에서 분류할 만한 글자를 찾지 못했습니다.${hint ? ` ${hint}` : ''}`);
}

const extensionOf = (file: File) => file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : '이';

/** Keep rows, cells, headings and list boundaries when a handover was exported as HTML.
 * Plain tag removal used to join "업무마감담당부서입력12월20일학사지원팀" into one word.
 * Merge attributes stay visible so a shared deadline/department is not assigned to one row only.
 */
const stripTags = (value: string) => value
  .replace(/<!--[^]*?-->/g, '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi, (_, row: string) => {
    const cells = [...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)].map((cell) => {
      const merged = [...cell[2].matchAll(/\b(rowspan|colspan)\s*=\s*["']?(\d+)/gi)].map((match) =>
        Number(match[2]) > 1 ? `[${match[1].toLowerCase() === 'rowspan' ? '행' : '열'} 병합 ${match[2]}] ` : '',
      ).join('');
      const content = cell[3].replace(/<\/?(?:p|div|br|li)\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
      return merged + content;
    });
    /* No trailing newline: consecutive rows have to stay consecutive lines, or the tidier's
       blank-line collapse turns one schedule into a run of unrelated single-row fragments. */
    return cells.length ? `\n| ${cells.join(' | ')} |` : `\n${row}`;
  })
  .replace(/<li\b[^>]*>/gi, '\n- ')
  .replace(/<\/li\s*>/gi, '')
  .replace(/<\/?(?:p|div|h[1-6]|br|table|caption|thead|tbody|tfoot|ul|ol|section|article|header|footer|dl|dt|dd)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '');

function decodeEntities(value: string) {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code: string) => {
      const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : entity;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
