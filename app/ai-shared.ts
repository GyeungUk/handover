/** Shared plumbing for the model-backed handover routes: one call helper, one HTML builder. */

import { env } from 'cloudflare:workers';
import { handoverCategories, propertyFieldsByCategory, type HandoverCategory } from './handover-schema';

/**
 * GPT-5.6 Luna answers every handover workflow. The endpoint and reasoning effort remain
 * configurable for local proxies and latency/cost experiments, but the model itself is deliberately
 * fixed so deployments cannot silently produce different results.
 */
type ModelEnv = Cloudflare.Env & {
  OPENAI_BASE_URL?: string;
  OPENAI_REASONING_EFFORT?: string;
};

const OPENAI_MODEL = 'gpt-5.6-luna';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1/chat/completions';
/**
 * Left unset, a GPT-5 class model answers these routes with no reasoning at all, and the section it
 * files a paragraph under becomes close to a guess — 담당업무 collects everything with a date on it.
 * Blank turns the field off, for a model that does not accept it.
 */
const DEFAULT_REASONING_EFFORT = 'medium';

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Collapses whitespace so a model quote can be matched against the text it was drawn from. */
export const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Reject concrete numbers the model introduced even when the surrounding prose sounds plausible. */
export function usesOnlyRecordedNumbers(candidate: string, source: string, allowed: string[] = []) {
  const recorded = new Set([...(source.match(/\d+(?:[.,:/-]\d+)*/g) ?? []), ...allowed]);
  return (candidate.match(/\d+(?:[.,:/-]\d+)*/g) ?? []).every((token) => recorded.has(token));
}

/** Models return plain text only; the HTML the editor renders is built here, fully escaped. */
export function detailHtml(paragraphs: string[], questions: string[]) {
  const body = paragraphs.map((line) => {
    const labeled = line.match(/^\[([^\]\r\n]{1,30})\]\s*(.*)$/u);
    if (!labeled) return `<p>${escapeHtml(line)}</p>`;
    const heading = escapeHtml(labeled[1].trim());
    const detail = labeled[2].trim();
    return `<p><strong>${heading}</strong>${detail ? `<br>${escapeHtml(detail)}` : ''}</p>`;
  }).join('');
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
  const config = env as ModelEnv;
  const reasoningEffort = (config.OPENAI_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT).trim();
  const response = await fetch(config.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
