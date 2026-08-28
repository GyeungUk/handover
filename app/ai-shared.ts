/** Shared plumbing for the model-backed handover routes: one call helper, one HTML builder. */

import { handoverCategories, propertyFieldsByCategory, type HandoverCategory } from './handover-schema';

export const MODEL = 'gpt-5.4-mini';

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Collapses whitespace so a model quote can be matched against the text it was drawn from. */
export const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Models return plain text only; the HTML the editor renders is built here, fully escaped. */
export function detailHtml(paragraphs: string[], questions: string[]) {
  const body = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  if (!questions.length) return body;
  return `${body}<p><strong>확인이 필요한 내용</strong></p><ul>${questions.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

/** Drop anything the editor's own property fields would not accept. */
export function cleanProperties(
  category: HandoverCategory,
  pairs: { key: string; value: string }[],
  allowKey: (key: string) => boolean = () => true,
) {
  const fields = propertyFieldsByCategory[category];
  const cleaned: Record<string, string> = {};
  for (const { key, value } of pairs ?? []) {
    const field = fields.find((item) => item.key === key);
    const trimmed = (value ?? '').trim();
    if (!field || !trimmed || !allowKey(key)) continue;
    if (field.options && !field.options.includes(trimmed)) continue;
    cleaned[key] = trimmed;
  }
  return cleaned;
}

export type ModelResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** One structured-output call. Every route funnels through here so failures read the same way. */
export async function askModel<T>(options: {
  apiKey: string;
  label: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
}): Promise<ModelResult<T>> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: options.schemaName, strict: true, schema: options.schema } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`${options.label}: openai request failed`, response.status, detail.slice(0, 400));
    return { ok: false, status: 502, error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  const completion = await response.json<{ choices: { message: { content: string } }[] }>();
  try {
    return { ok: true, data: JSON.parse(completion.choices[0].message.content) as T };
  } catch {
    return { ok: false, status: 502, error: '결과 형식을 읽지 못했습니다. 다시 시도해 주세요.' };
  }
}

/**
 * The property spec handed to the model. Without the label and the editor's own example the model
 * fills a "next owner" field with a sentence, so both travel with every key.
 */
export function allowedProperties(include: (key: string) => boolean = () => true) {
  return Object.fromEntries(handoverCategories.map((category) => [
    category,
    propertyFieldsByCategory[category].filter((field) => include(field.key)).map((field) => ({
      key: field.key,
      설명: field.label,
      ...(field.options ? { 선택지: field.options } : { 예시: field.placeholder }),
    })),
  ]));
}
