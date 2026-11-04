/**
 * Saved charts.
 *
 *   GET    /api/charts          list the caller's charts (newest first)
 *   GET    /api/charts?id=…     one chart
 *   POST   /api/charts          save a chart   { name, birth, settings, summary, engineFingerprint }
 *   DELETE /api/charts?id=…     delete one of the caller's charts
 *
 * Every query is filtered by the caller's owner hash, so an id alone never
 * reaches another visitor's chart — a guessed UUID returns 404, not someone
 * else's birth data.
 *
 * Only chart INPUTS are stored. The client recomputes positions on load, so a
 * fix to the engine corrects every saved chart instead of serving stale numbers
 * from the database.
 */
import { z } from 'zod';
import { db, fail, HttpError, json, ownerHash, preflight, readJson } from './_lib.js';

const MAX_CHARTS_PER_OWNER = 500;

const civilDate = z.object({
  year: z.number().int().min(-2999).max(2999),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

const civilTime = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  second: z.number().int().min(0).max(59).optional(),
});

const zone = z.union([
  z.object({ kind: z.literal('iana'), zone: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('fixed'), offsetMinutes: z.number().int().min(-840).max(840) }),
]);

const birth = z.object({
  name: z.string().max(120).optional(),
  date: civilDate,
  time: civilTime.optional(),
  zone,
  place: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(200).optional(),
  }),
});

const saveBody = z.object({
  name: z.string().trim().min(1).max(120),
  birth,
  settings: z.record(z.string(), z.unknown()).default({}),
  summary: z.record(z.string(), z.unknown()).default({}),
  engineFingerprint: z.string().regex(/^[0-9a-f]{8}$/).optional(),
});

const uuid = z.string().uuid();

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = ownerHash(request);
    const id = new URL(request.url).searchParams.get('id');
    const sql = db();

    if (id) {
      if (!uuid.safeParse(id).success) throw new HttpError(400, 'INVALID_ID');
      const rows = (await sql.query(
        `SELECT id, name, birth, settings, summary, engine_fingerprint, created_at, updated_at
           FROM charts WHERE id = $1 AND owner_hash = $2`,
        [id, owner],
      )) as Record<string, unknown>[];
      if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND');
      return json(request, { chart: rows[0] });
    }

    const rows = await sql.query(
      `SELECT id, name, birth, summary, engine_fingerprint, created_at
         FROM charts WHERE owner_hash = $1 ORDER BY created_at DESC LIMIT 200`,
      [owner],
    );
    return json(request, { charts: rows });
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const owner = ownerHash(request);
    const parsed = saveBody.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(422, 'INVALID_CHART');
    const sql = db();

    const counted = (await sql.query(
      'SELECT count(*)::int AS count FROM charts WHERE owner_hash = $1',
      [owner],
    )) as { count: number }[];
    if ((counted[0]?.count ?? 0) >= MAX_CHARTS_PER_OWNER) throw new HttpError(429, 'CHART_LIMIT_REACHED');

    const body = parsed.data;
    const rows = await sql.query(
      `INSERT INTO charts (owner_hash, name, birth, settings, summary, engine_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, birth, summary, engine_fingerprint, created_at`,
      [owner, body.name, body.birth, body.settings, body.summary, body.engineFingerprint ?? null],
    );
    return json(request, { chart: (rows as unknown[])[0] }, 201);
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const owner = ownerHash(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !uuid.safeParse(id).success) throw new HttpError(400, 'INVALID_ID');
    const rows = (await db().query(
      'DELETE FROM charts WHERE id = $1 AND owner_hash = $2 RETURNING id',
      [id, owner],
    )) as unknown[];
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND');
    return json(request, { deleted: id });
  } catch (cause) {
    return fail(request, cause);
  }
}
