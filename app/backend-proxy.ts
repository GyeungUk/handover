/**
 * The Vercel application is the public, same-origin gateway for the Spring API on Render.
 * Keeping the browser URL at `/api/*` is essential: the backend's HttpOnly session cookie is then
 * issued to and sent back to this Vercel origin, rather than being treated as a cross-site cookie.
 */
const excludedRequestHeaders = new Set(['host', 'connection', 'content-length']);
const excludedResponseHeaders = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

function apiTarget() {
  const raw = process.env.HANDOVER_API_TARGET?.trim();
  return raw ? raw.replace(/\/$/, '') : null;
}

export async function proxyBackendRequest(request: Request) {
  const target = apiTarget();
  if (!target) {
    return Response.json({ error: '백엔드 연결이 설정되지 않았습니다.' }, { status: 503 });
  }

  const incomingUrl = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!excludedRequestHeaders.has(name.toLowerCase())) headers.set(name, value);
  });

  // This value is configured only in Vercel and Render. It prevents direct requests to Render
  // from using either session or authentication endpoints.
  const gatewaySecret = process.env.HANDOVER_GATEWAY_SECRET;
  if (gatewaySecret) {
    headers.set(process.env.HANDOVER_GATEWAY_SECRET_HEADER || 'x-handover-gateway-secret', gatewaySecret);
  }

  try {
    const upstream = await fetch(`${target}${incomingUrl.pathname}${incomingUrl.search}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      // Node's fetch requires this when forwarding a streaming request body.
      duplex: 'half',
      redirect: 'manual',
    } as RequestInit);

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, name) => {
      if (!excludedResponseHeaders.has(name.toLowerCase())) responseHeaders.append(name, value);
    });
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('Render API proxy failed', error);
    return Response.json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
