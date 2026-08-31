import { headers } from 'next/headers';

/**
 * Identity as the ChatGPT authentication proxy described it.
 *
 * **Legacy.** The workspace signs people in itself now — employee number and password, held by the
 * Spring backend; see `app/session.ts`. Only the Cloudflare D1 route handlers under `app/api/**`
 * still read these headers, and they no longer match the login screen. Keep them in step, or drop
 * them, before serving `/api/*` from the Worker again.
 */

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER = 'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName = encodedFullName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
    ? safeDecodeURIComponent(encodedFullName)
    : null;

  return { userId, email: email.toLowerCase(), displayName: fullName ?? email, fullName };
}

function safeDecodeURIComponent(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}
