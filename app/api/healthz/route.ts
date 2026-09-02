import { backendTarget } from '../../session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* Matches the pinger's own 30-second ceiling: a longer wait would be cut off at its end anyway. */
export const maxDuration = 30;

/**
 * Whether the Spring backend on Render is answering, for an external uptime pinger to call.
 *
 * The backend is on Render's free plan, which stops the instance after fifteen idle minutes and
 * takes over a minute to start it again — a wait the first visitor after a quiet spell would
 * otherwise absorb. A scheduled request here keeps the instance from ever going idle.
 *
 * It cannot go through {@link proxyBackendRequest}, which forwards the incoming path verbatim: the
 * backend's health endpoint is `/healthz`, not `/api/healthz`. Nothing is proxied back either. The
 * caller is a machine that only needs a status code, and this route is public, so it says whether
 * the backend answered and nothing else about it.
 */
export async function GET() {
  const target = backendTarget();
  if (!target) return Response.json({ status: 'not-configured' }, { status: 503 });

  try {
    const upstream = await fetch(`${target}/healthz`, {
      cache: 'no-store',
      /* Leaves headroom under maxDuration so a slow wake-up still returns rather than being killed. */
      signal: AbortSignal.timeout(25_000),
    });
    if (!upstream.ok) return Response.json({ status: 'unhealthy' }, { status: 502 });
    return Response.json({ status: 'ok' });
  } catch {
    /* A timeout still did its job: the request that timed out is what started the instance. */
    return Response.json({ status: 'unreachable' }, { status: 504 });
  }
}
