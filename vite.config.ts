import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};


/**
 * Sends `/api/*` to the Spring backend instead of the Next.js route handlers.
 *
 * `HANDOVER_API_TARGET` in `.env.local` decides which backend answers. Point it at the Spring
 * server to use it; comment the line out and the existing Next.js route handlers serve the app
 * exactly as before. Both backends stay in the tree, so flipping back is a one-line edit.
 *
 * This has to be a proxy rather than a base URL on the client. The app authenticates with a session
 * cookie the backend sets, and a cookie is only sent back to the origin that set it. Proxying keeps
 * every `/api/*` call same-origin, so the browser attaches the cookie on the way out and stores the
 * one `/api/auth/login` sets on the way back — which is also how the reverse proxy in front of
 * production has to behave.
 *
 * It also plays the gateway's other part. When the backend is configured with
 * `handover.auth.gateway-secret`, it only trusts identity headers on a request carrying that shared
 * secret — proof the request came through the proxy rather than straight at the service. This dev
 * proxy is that gateway, so it attaches the secret here; without it every call would arrive
 * unauthenticated. Set `HANDOVER_GATEWAY_SECRET` in `.env.local` to the same value as
 * `backend/.env`.
 */
function springApiProxy(target: string, gatewaySecret: string, gatewaySecretHeader: string): Plugin {
  return {
    name: 'handover-spring-api-proxy',
    // The returned function defers registration until Vite's own middlewares and the sites plugin's
    // header injection are already in the chain, so `request.headers` carries the signed-in user.
    configureServer(server) {
      return () => {
        server.config.logger.info(`Handover API proxy: /api/* -> ${target}`);
        server.middlewares.use(async (request, response, next) => {
          const path = request.url ?? '/';
          if (!path.startsWith('/api/')) return next();

          const body =
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : Buffer.concat(await collect(request));

          // `host` and `content-length` describe the hop we are replacing, so they are recomputed.
          const headers = new Headers();
          for (const [name, value] of Object.entries(request.headers)) {
            if (!value || name === 'host' || name === 'connection' || name === 'content-length') continue;
            headers.set(name, Array.isArray(value) ? value.join(', ') : value);
          }
          // Set last, so a copy arriving from the browser cannot forge or override it.
          if (gatewaySecret) headers.set(gatewaySecretHeader, gatewaySecret);

          try {
            const upstream = await fetch(new URL(path, target), {
              method: request.method,
              headers,
              body,
              redirect: 'manual',
            });
            const payload = Buffer.from(await upstream.arrayBuffer());
            response.statusCode = upstream.status;
            upstream.headers.forEach((value, name) => {
              // The body is already decoded and re-measured; the upstream framing does not apply.
              if (name === 'content-encoding' || name === 'content-length' || name === 'transfer-encoding') return;
              // `forEach` folds repeated Set-Cookie headers into one comma-joined string, which no
              // browser will parse back into cookies. They are re-attached in full below.
              if (name === 'set-cookie') return;
              response.setHeader(name, value);
            });
            // The login endpoints answer with the session cookie; without this the sign-in is lost.
            const cookies = upstream.headers.getSetCookie();
            if (cookies.length) response.setHeader('set-cookie', cookies);
            response.setHeader('content-length', String(payload.byteLength));
            response.end(payload);
          } catch (failure) {
            server.config.logger.error(`Handover API proxy: ${target} unreachable — ${failure}`);
            response.statusCode = 502;
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }));
          }
        });
      };
    },
  };
}

function collect(stream: NodeJS.ReadableStream) {
  return new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(chunks));
    stream.on('error', reject);
  });
}

export default defineConfig(async ({ mode }) => {
  // `.env.local` decides which backend serves `/api/*`; it is not bundled into the client.
  const {
    HANDOVER_API_TARGET,
    HANDOVER_GATEWAY_SECRET = '',
    HANDOVER_GATEWAY_SECRET_HEADER = 'x-handover-gateway-secret',
  } = loadEnv(mode, process.cwd(), 'HANDOVER_');

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      // Listed first so its deferred middleware is registered ahead of the app handler.
      ...(HANDOVER_API_TARGET
        ? [springApiProxy(HANDOVER_API_TARGET, HANDOVER_GATEWAY_SECRET, HANDOVER_GATEWAY_SECRET_HEADER)]
        : []),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
