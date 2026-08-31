import { headers } from 'next/headers';
import type { SessionUser } from './WorkspaceClient';

/**
 * Who the browser is, according to the backend that issued its session cookie.
 *
 * The workspace used to read `oai-authenticated-user-*` headers the ChatGPT proxy set on the way in,
 * so the server knew the caller without asking anyone. Sign-in is now the app's own: the browser
 * holds an opaque session cookie and only the backend can say what it means, so this page render has
 * to ask. One request per render, on the same connection the API calls already use.
 *
 * The session cookie is `HttpOnly`, so it is forwarded from the incoming request rather than read.
 */
export type BackendConfigurationError = { error: 'not-configured' };

type BackendEnv = NodeJS.ProcessEnv & {
  HANDOVER_API_TARGET?: string;
  HANDOVER_GATEWAY_SECRET?: string;
  HANDOVER_GATEWAY_SECRET_HEADER?: string;
};

const SESSION_COOKIE = 'handover_session';

/** Where the Spring backend lives. Nothing works without it, which the login page says out loud. */
export function backendTarget(): string | null {
  const target = (process.env as BackendEnv).HANDOVER_API_TARGET?.trim();
  return target ? target.replace(/\/$/, '') : null;
}

export async function getSession(): Promise<SessionUser | null | BackendConfigurationError> {
  const target = backendTarget();
  if (!target) return { error: 'not-configured' };

  const config = process.env as BackendEnv;
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  /* No cookie at all is the common case — the login page — and not worth a round trip. */
  if (!cookie || !cookie.includes(`${SESSION_COOKIE}=`)) return null;

  const forwarded = new Headers({ cookie });
  /* This render is part of the gateway, so it presents the shared secret the proxy would. */
  if (config.HANDOVER_GATEWAY_SECRET) {
    forwarded.set(config.HANDOVER_GATEWAY_SECRET_HEADER || 'x-handover-gateway-secret', config.HANDOVER_GATEWAY_SECRET);
  }

  try {
    const response = await fetch(`${target}/api/auth/session`, { headers: forwarded, cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json<{ user: SessionUser | null }>();
    return body.user ?? null;
  } catch {
    /* The backend being down is not the visitor's problem to solve: show them the login screen. */
    return null;
  }
}
