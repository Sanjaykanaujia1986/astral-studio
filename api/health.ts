/**
 *   GET /api/health
 *
 * Confirms the function can reach Neon and reports what is loaded. Counts only;
 * never a connection string, host or error detail.
 */
import { db, fail, json, preflight } from './_lib.js';

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const started = Date.now();
    const [counts] = (await db().query(
      `SELECT (SELECT count(*) FROM cities)::int          AS cities,
              (SELECT count(*) FROM ephemeris_daily)::int AS ephemeris_days,
              (SELECT count(*) FROM charts)::int          AS saved_charts,
              (SELECT max(version) FROM schema_migrations) AS schema_version`,
    )) as Record<string, number>[];
    return json(request, { ok: true, database: 'neon', latencyMs: Date.now() - started, ...counts });
  } catch (cause) {
    return fail(request, cause);
  }
}
