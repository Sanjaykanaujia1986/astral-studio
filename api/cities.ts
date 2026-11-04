/**
 *   GET /api/cities?q=mumbai&limit=10[&country=IN]
 *
 * Prefix search over GeoNames cities5000 (CC BY 4.0), most populous first.
 * Folding matches the client's `foldForSearch` exactly, so "zurich" finds
 * "Zürich" here as it does offline.
 */
import { db, fail, HttpError, json, preflight } from './_lib.js';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Escape LIKE wildcards so a query of "%" is a literal, not "everything". */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const q = fold(params.get('q') ?? '');
    if (q.length < 2 || q.length > 80) throw new HttpError(400, 'QUERY_LENGTH');
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 10));
    const country = params.get('country')?.toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'INVALID_COUNTRY');

    const rows = await db().query(
      `SELECT name, admin1, country_code, country_name, latitude, longitude, timezone, population
         FROM cities
        WHERE name_folded LIKE $1 ESCAPE '\\'
          AND ($2::text IS NULL OR country_code = $2)
        ORDER BY population DESC
        LIMIT $3`,
      [`${escapeLike(q)}%`, country ?? null, limit],
    );
    return json(request, { cities: rows, attribution: 'GeoNames, CC BY 4.0' }, 200, {
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    });
  } catch (cause) {
    return fail(request, cause);
  }
}
