import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Drop the duplicate WASM payload Vite emits but nothing loads.
 *
 * `swisseph-wasm` locates its payload with `new URL('../wasm/' + path,
 * import.meta.url)`. Vite sees the pattern, cannot evaluate the dynamic half,
 * and emits a hashed copy into /assets/ as a precaution. At runtime the
 * expression resolves against the built chunk's own URL and reaches
 * `/wasm/swisseph.wasm` — the copy staged into public/ — so the hashed one is
 * never requested. Verified by reading the network log of a production build:
 * only /wasm/* is fetched.
 *
 * It is 562 KB, which is 6.5% of the Android APK, shipped to every user to be
 * ignored. The plugin removes it after the bundle is generated, which is late
 * enough that nothing can still reference it and early enough that it never
 * reaches disk.
 */
function dropUnusedWasmDuplicate() {
  return {
    name: 'astro:drop-unused-wasm-duplicate',
    generateBundle(_options: unknown, bundle: Record<string, { type: string }>) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.startsWith('assets/') && fileName.endsWith('.wasm')) {
          delete bundle[fileName];
        }
      }
    },
  };
}

/**
 * The account API inside `vite dev`, so sign-in can be tried locally.
 *
 * Production runs /api as Vercel functions against Neon. Here the same
 * handler files are loaded through Vite and pointed at an in-memory Postgres
 * (PGlite) that starts empty each time the dev server starts: nothing touches
 * the real database and nothing personal persists. The admin is whoever
 * registers as `admin@localhost.test` (override with ADMIN_EMAILS).
 *
 * `Secure` is dropped from cookies only here, because the dev server is
 * plain http. `apply: 'serve'` keeps all of this out of the build.
 */
function devApi(): Plugin {
  const ROUTES = new Set(['auth', 'admin', 'charts']);
  const api = (name: string): string => fileURLToPath(new URL(`../../api/${name}.ts`, import.meta.url));
  let ready: Promise<void> | null = null;

  const prepare = (server: ViteDevServer): Promise<void> => (ready ??= (async () => {
    process.env.ADMIN_EMAILS ??= 'admin@localhost.test';
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    const schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
      .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await pg.exec(schema);
    const lib = await server.ssrLoadModule(api('_lib'));
    lib.useDatabaseForTests({
      query: async (text: string, params?: readonly unknown[]) =>
        (await pg.query(text, params ? [...params] : [])).rows as Record<string, unknown>[],
    });
  })());

  const body = (req: IncomingMessage): Promise<Buffer> => new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });

  return {
    name: 'astro:dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const route = /^\/api\/([a-z]+)(?:[/?]|$)/.exec(req.url ?? '')?.[1];
        if (!route || !ROUTES.has(route)) { next(); return; }
        try {
          await prepare(server);
          const mod = await server.ssrLoadModule(api(route));
          const method = req.method ?? 'GET';
          const handler = mod[method] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) { res.statusCode = 405; res.end(); return; }
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const raw = method === 'GET' || method === 'HEAD' ? undefined : await body(req);
          const response = await handler(new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
            method, headers, ...(raw && raw.length > 0 ? { body: new Uint8Array(raw) } : {}),
          }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => {
            res.setHeader(k, k === 'set-cookie' ? v.replace(/; Secure/g, '') : v);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (cause) {
          server.config.logger.error(`dev api: ${String(cause)}`);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'INTERNAL' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropUnusedWasmDuplicate(), devApi()],
  resolve: {
    /*
     * Force a single React instance.
     *
     * The workspace packages (@astro/ui, @astro/i18n) are symlinked, so Vite
     * resolves their `react` import against the raw node_modules copy while app
     * code gets the pre-bundled one in .vite/deps. Two instances means two
     * separate hook dispatchers, and every hook called inside a workspace
     * component throws "Invalid hook call".
     *
     * It stayed hidden until those packages started using hooks — before the
     * i18n work they were pure render functions, so nothing tripped it.
     */
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundling rewrites import.meta.url, which is how swisseph-wasm finds
    // its .wasm and .data payloads. Leaving it unoptimised keeps that intact.
    exclude: ['swisseph-wasm'],
    // Pre-bundle the linked workspace packages alongside app code so they share
    // the same React instance.
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  server: { port: 5179, strictPort: true },
});
