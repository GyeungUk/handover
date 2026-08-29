/**
 * Where the workspace sends its API calls.
 *
 * NOT the mechanism the switch to Spring actually uses, and unused for that reason.
 *
 * The app authenticates with `oai-authenticated-user-*` headers that the browser never sends: the
 * sites plugin injects them in dev, and the ChatGPT proxy injects them in production. A request sent
 * straight from the browser to another origin therefore arrives with no identity and is rejected
 * with 401. Pointing this at the Spring backend on its own does not work.
 *
 * The working switch is the `/api/*` proxy in `vite.config.ts`, which keeps requests same-origin and
 * forwards them after the identity headers are attached. See backend/README.md section 7.
 *
 * This helper is kept for the one deployment shape where it would apply: front end and API on
 * different origins, with the authenticating proxy in front of both.
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

/** `apiUrl('/api/members')` — an absolute URL when a base is configured, the path itself otherwise. */
export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

/**
 * Fetch options every call needs once the API lives on another origin: the authentication proxy's
 * session cookie only rides along when credentials are included. Harmless while same-origin.
 */
export const apiRequestInit: RequestInit = API_BASE_URL ? { credentials: 'include' } : {};
