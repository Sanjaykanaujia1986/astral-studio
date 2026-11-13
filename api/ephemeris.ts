/**
 *   GET /api/ephemeris?date=2024-03-20
 *   GET /api/ephemeris?from=2024-01-01&to=2024-01-31
 *
 * Daily positions at 00:00 UT, 1900-01-01 to 2100-12-31, computed by the same
 * engine the app runs (fingerprint 0123070b). Tropical, geocentric; longitude,
 * latitude, speed and declination in degrees, rounded to 1e-7.
 *
 * A range is capped at 366 days so one request cannot pull the whole table.
 */
import { db, fail, HttpError, json, preflight } from './_lib.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get('date');
    const from = date ?? params.get('from');
    const to = date ?? params.get('to');
    if (!from || !to || !ISO.test(from) || !ISO.test(to)) throw new HttpError(400, 'INVALID_DATE');
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (!Number.isFinite(span) || span < 0) throw new HttpError(400, 'INVALID_RANGE');
    if (span >= MAX_DAYS) throw new HttpError(400, 'RANGE_TOO_LARGE');

    const rows = await db().query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, jd_ut, source, positions
         FROM ephemeris_daily WHERE day BETWEEN $1 AND $2 ORDER BY day`,
      [from, to],
    );
    return json(request, {
      sampledAt: '00:00 UT', zodiac: 'tropical', days: rows,
    }, 200, { 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable' });
  } catch (cause) {
    return fail(request, cause);
  }
}
