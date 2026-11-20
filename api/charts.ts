/**
 * Saved charts: the admin's library of horoscopes of anybody.
 *
 *   GET    /api/charts          list the caller's charts (newest first)
 *   GET    /api/charts?id=…     one chart
 *   POST   /api/charts          save a chart   { name, birth, settings, summary, engineFingerprint }
 *   DELETE /api/charts?id=…     delete one of the caller's charts
 *
 * Admins only. Every query is filtered by the admin's own account, so an id
 * alone never reaches another admin's chart — a guessed UUID returns 404.
 *
 * Only chart INPUTS are stored. The client recomputes positions on load, so a
 * fix to the engine corrects every saved chart instead of serving stale numbers
 * from the database.
 */
import { z } from 'zod';
import { db, fail, HttpError, json, preflight, readJson } from './_lib.js';
import { birthSchema as birth, ensureSchema, requireAdmin, requireJson } from './_auth.js';
import { createHash } from 'node:crypto';

const MAX_CHARTS_PER_OWNER = 500;

/**
 * Charts saved before accounts existed belong to a device key. When an admin
 * opens the list from that device, those charts become theirs: nothing is
 * lost in the move to accounts, and a key alone no longer reads anything.
 */
async function adoptDeviceCharts(request: Request, userId: string): Promise<void> {
  const key = request.headers.get('x-astro-owner') ?? '';
  if (!/^[0-9a-f]{64}$/.test(key)) return;
  await db().query(
    'UPDATE charts SET user_id = $1 WHERE owner_hash = $2 AND user_id IS NULL',
    [userId, createHash('sha256').update(key).digest('hex')],
  );
}

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
    await ensureSchema();
    const owner = (await requireAdmin(request)).id;
    const id = new URL(request.url).searchParams.get('id');
    const sql = db();

    if (id) {
      if (!uuid.safeParse(id).success) throw new HttpError(400, 'INVALID_ID');
      const rows = (await sql.query(
        `SELECT id, name, birth, settings, summary, engine_fingerprint, created_at, updated_at
           FROM charts WHERE id = $1 AND user_id = $2`,
        [id, owner],
      ));
      if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND');
      return json(request, { chart: rows[0] });
    }

    await adoptDeviceCharts(request, owner);
    const rows = await sql.query(
      `SELECT id, name, birth, summary, engine_fingerprint, created_at
         FROM charts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [owner],
    );
    return json(request, { charts: rows });
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    requireJson(request);
    const owner = (await requireAdmin(request)).id;
    const parsed = saveBody.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(422, 'INVALID_CHART');
    const sql = db();

    const counted = (await sql.query(
      'SELECT count(*)::int AS count FROM charts WHERE user_id = $1',
      [owner],
    ));
    if (Number(counted[0]?.count ?? 0) >= MAX_CHARTS_PER_OWNER) throw new HttpError(429, 'CHART_LIMIT_REACHED');

    const body = parsed.data;
    const rows = await sql.query(
      `INSERT INTO charts (user_id, name, birth, settings, summary, engine_fingerprint)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)
       RETURNING id, name, birth, summary, engine_fingerprint, created_at`,
      [owner, body.name, JSON.stringify(body.birth), JSON.stringify(body.settings), JSON.stringify(body.summary), body.engineFingerprint ?? null],
    );
    return json(request, { chart: rows[0] }, 201);
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    const owner = (await requireAdmin(request)).id;
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !uuid.safeParse(id).success) throw new HttpError(400, 'INVALID_ID');
    const rows = (await db().query(
      'DELETE FROM charts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, owner],
    ));
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND');
    return json(request, { deleted: id });
  } catch (cause) {
    return fail(request, cause);
  }
}
