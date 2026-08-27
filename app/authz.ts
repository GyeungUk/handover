import type { ChatGPTUser } from './chatgpt-auth';

export type AppRole = 'admin' | 'member';

const ADMIN_EMAIL = 'gyeunguk2062@gmail.com';
const MEMBER_EMAIL = 'ruddnr2062@gmail.com';

export function getAppRole(user: ChatGPTUser): AppRole | null {
  if (user.email === ADMIN_EMAIL) return 'admin';
  if (user.email === MEMBER_EMAIL) return 'member';
  if (process.env.NODE_ENV !== 'production' && user.email === 'seedy@sites.test') return 'admin';
  return null;
}
