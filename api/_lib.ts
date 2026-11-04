/**
 * Shared helpers for the Vercel functions.
 *
 * Files under /api whose names start with an underscore are not deployed as
 * routes, so this module is importable but not reachable.
 */
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | undefined;

export function db(): ReturnType<typeof neon> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new HttpError(503, 'DATABASE_NOT_CONFIGURED');
  client ??= neon(url);
  return client;
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/**
 * Origins allowed to call the API cross-origin.
 *
 * The web app calls same-origin and needs no CORS at all. The Android build
 * runs at `https://localhost` inside the Capacitor WebView, so it is a
 * different origin and must be named explicitly. Nothing else is allowed.
 */
const ALLOWED_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-astro-owner',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function json(request: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
      ...extra,
    },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Errors become codes, never stack traces or SQL. */
export function fail(request: Request, cause: unknown): Response {
  if (cause instanceof HttpError) return json(request, { error: cause.code }, cause.status);
  console.error(cause);
  return json(request, { error: 'INTERNAL' }, 500);
}

/**
 * Resolve the caller's owner key to the hash stored in the database.
 *
 * The key is 64 hex characters of device-generated randomness. Anything else is
 * rejected outright rather than hashed, so a guessable short key cannot be used
 * to create a trivially enumerable owner.
 */
export function ownerHash(request: Request): string {
  const key = request.headers.get('x-astro-owner') ?? '';
  if (!/^[0-9a-f]{64}$/.test(key)) throw new HttpError(401, 'OWNER_KEY_REQUIRED');
  return createHash('sha256').update(key).digest('hex');
}

/** Read a JSON body with a hard size cap. */
export async function readJson(request: Request, maxBytes = 32_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON');
  }
}
