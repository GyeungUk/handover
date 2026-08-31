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

export async function extractText(file: File): Promise<string> {
  try {
    if (/\.docx$/i.test(file.name)) return await readDocx(file);
    if (hangulLike.test(file.name)) return await readHangul(file);
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return await readPdf(file);
    if (spreadsheetLike.test(file.name)) return await readSpreadsheet(file);
    if (imageLike.test(file.name) || /^image\/(png|jpeg|webp)$/i.test(file.type)) return await readImage(file);
    if (textLike.test(file.name) || file.type.startsWith('text/')) return decodeEntities(stripTags(await file.text())).trim();
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
  const text = value.trim();
  if (text.length >= 30) return text;
  throw new Error(`${kind}에서 분류할 만한 글자를 찾지 못했습니다.${hint ? ` ${hint}` : ''}`);
}

const extensionOf = (file: File) => file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : '이';

const stripTags = (value: string) =>
  value.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, '');

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
