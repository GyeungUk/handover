import { env } from 'cloudflare:workers';
import type { ChatGPTUser } from './chatgpt-auth';

export type AppRole = 'admin' | 'member';

/**
 * Who may use the workspace, and who administers it.
 *
 * The lists live in the environment (`.dev.vars` locally, Worker secrets in production) rather than
 * in this file, so adding a colleague is a configuration change instead of a code change and no
 * personal address ends up in the repository. The names and the comma-separated format match
 * `handover.auth.*` on the Spring backend, so one set of values configures either backend.
 *
 * Missing configuration denies everyone: an empty allow list is never an open one.
 */
type AuthEnv = Cloudflare.Env & {
  HANDOVER_ADMIN_EMAILS?: string;
  HANDOVER_MEMBER_EMAILS?: string;
};

/** The sites plugin signs local requests in as this account; never accepted in production. */
const DEV_SEED_EMAIL = 'seedy@sites.test';

const allowList = (value: string | undefined) =>
  new Set((value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

export function getAppRole(user: ChatGPTUser): AppRole | null {
  const config = env as AuthEnv;
  const email = user.email.trim().toLowerCase();

  if (allowList(config.HANDOVER_ADMIN_EMAILS).has(email)) return 'admin';
  if (allowList(config.HANDOVER_MEMBER_EMAILS).has(email)) return 'member';
  if (process.env.NODE_ENV !== 'production' && email === DEV_SEED_EMAIL) return 'admin';
  return null;
}
