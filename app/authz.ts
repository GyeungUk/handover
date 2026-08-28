import type { ChatGPTUser } from './chatgpt-auth';

export type AppRole = 'admin' | 'member';

const ADMIN_EMAIL = 'gyeunguk2062@gmail.com';
const MEMBER_EMAILS = new Set([
  'ruddnr2062@gmail.com',
  'seongwhan0712@gmail.com',
  'hyk@ssu.ac.kr',
]);

export function getAppRole(user: ChatGPTUser): AppRole | null {
  if (user.email === ADMIN_EMAIL) return 'admin';
  if (MEMBER_EMAILS.has(user.email)) return 'member';
  if (process.env.NODE_ENV !== 'production' && user.email === 'seedy@sites.test') return 'admin';
  return null;
}
