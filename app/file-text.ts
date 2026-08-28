/**
 * Pulls plain text out of an uploaded handover file in the browser, with no extra dependency.
 * Word files are read straight from the zip; anything else we cannot open asks for a paste instead.
 */

const textLike = /\.(txt|md|markdown|csv|tsv|json|htm|html|xml)$/i;

export const supportedNote = 'TXT · MD · CSV · DOCX 파일을 읽을 수 있습니다.';

export async function extractText(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) return readDocx(file);
  if (textLike.test(file.name) || file.type.startsWith('text/')) return decodeEntities(stripTags(await file.text())).trim();
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : '이';
  throw new Error(`${extension} 형식은 아직 자동으로 읽지 못합니다. 문서 내용을 복사해 아래에 붙여넣어 주세요.`);
}

async function readDocx(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entry = findZipEntry(bytes, 'word/document.xml');
  if (!entry) throw new Error('워드 문서에서 본문을 찾지 못했습니다. 내용을 복사해 아래에 붙여넣어 주세요.');
  const raw = entry.method === 8 ? await inflateRaw(entry.data) : entry.data;
  return documentXmlToText(new TextDecoder().decode(raw));
}

/** Walks the local file headers looking for one entry by name — enough for a .docx body. */
function findZipEntry(bytes: Uint8Array, name: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const target = new TextEncoder().encode(name);
  for (let at = 0; at + 30 < bytes.length; at += 1) {
    if (view.getUint32(at, true) !== 0x04034b50) continue;
    const nameLength = view.getUint16(at + 26, true);
    if (nameLength !== target.length) continue;
    const nameAt = at + 30;
    if (!target.every((code, index) => bytes[nameAt + index] === code)) continue;
    const size = view.getUint32(at + 18, true);
    if (!size) return null;
    const from = nameAt + nameLength + view.getUint16(at + 28, true);
    return { method: view.getUint16(at + 8, true), data: bytes.slice(from, from + size) };
  }
  return null;
}

async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function documentXmlToText(xml: string) {
  const body = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:(p|tr)>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ');
  return decodeEntities(stripTags(body)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

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
