/**
 * Migrate and seed the Neon database.
 *
 *   npx vite-node db/seed.ts            # schema + cities + ephemeris
 *   npx vite-node db/seed.ts --only=cities
 *
 * Reads DATABASE_URL from the environment or from `.env.db` (gitignored). The
 * connection string is never printed.
 *
 * NO invented data is loaded. Two datasets, both reproducible:
 *
 *   cities           GeoNames cities5000 (CC BY 4.0), the same file the app
 *                    bundles — packages/locations/data/cities.json
 *   ephemeris_daily  computed here by @astro/engine, the engine whose output
 *                    is fingerprinted `855fec9b` by the test suite
 *
 * Idempotent: rows are upserted, so a re-run corrects rather than duplicates.
 */
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import {
  SwissEphWasmProvider,
  runSelfTest,
  julianDay,
  sourceForJd,
  type Body,
} from '@astro/engine';
import { foldForSearch, type LocationDataset } from '@astro/locations';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (existsSync('.env.db')) {
    const line = readFileSync('.env.db', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim();
  }
  throw new Error('DATABASE_URL is not set and .env.db was not found');
}

const sql = neon(databaseUrl());
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const BATCH = 2000;

async function migrate(): Promise<void> {
  const text = readFileSync('db/schema.sql', 'utf8');
  // Strip comments, then split on statement terminators. The schema has no
  // semicolons inside strings or function bodies, which keeps this safe.
  const statements = text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  console.log(`schema: ${statements.length} statements applied`);
}

async function seedCities(): Promise<void> {
  const data = JSON.parse(
    readFileSync('packages/locations/data/cities.json', 'utf8'),
  ) as LocationDataset;
  const scale = data.coordinateScale;
  const rows = data.cities;

  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const ids: number[] = [];
    const names: string[] = [];
    const folded: string[] = [];
    const admin: (string | null)[] = [];
    const cc: string[] = [];
    const cn: string[] = [];
    const lat: number[] = [];
    const lon: number[] = [];
    const tz: string[] = [];
    const pop: number[] = [];
    chunk.forEach((row, i) => {
      const [name, sLat, sLon, tzIndex, countryIndex, admin1Code, population] = row;
      const country = data.countries[countryIndex]!;
      ids.push(start + i + 1);
      names.push(name);
      folded.push(foldForSearch(name));
      admin.push(data.admin1[`${country}.${admin1Code}`] ?? null);
      cc.push(country);
      cn.push(data.countryNames[country] ?? country);
      lat.push(sLat / scale);
      lon.push(sLon / scale);
      tz.push(data.timezones[tzIndex]!);
      pop.push(population);
    });
    await sql.query(
      `INSERT INTO cities (id, name, name_folded, admin1, country_code, country_name,
                           latitude, longitude, timezone, population)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::text[], $7::float8[], $8::float8[], $9::text[], $10::int[])
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, name_folded = EXCLUDED.name_folded, admin1 = EXCLUDED.admin1,
         country_code = EXCLUDED.country_code, country_name = EXCLUDED.country_name,
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
         timezone = EXCLUDED.timezone, population = EXCLUDED.population`,
      [ids, names, folded, admin, cc, cn, lat, lon, tz, pop],
    );
    process.stdout.write(`\rcities: ${Math.min(start + BATCH, rows.length)}/${rows.length}`);
  }
  await sql.query(
    `INSERT INTO dataset_meta (name, rows, source, license, detail) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (name) DO UPDATE SET rows=EXCLUDED.rows, source=EXCLUDED.source,
       license=EXCLUDED.license, detail=EXCLUDED.detail, loaded_at=now()`,
    ['cities', rows.length, data.source, data.license, { generated: data.generated }],
  );
  console.log(`\ncities: ${rows.length} rows`);
}

const EPHEMERIS_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'trueNode', 'chiron',
];

const round = (v: number) => Math.round(v * 1e7) / 1e7;

async function seedEphemeris(): Promise<void> {
  const provider = new SwissEphWasmProvider();
  await provider.init();

  // Refuse to publish reference data from an engine that does not reproduce
  // the certified fingerprint.
  const fingerprint = runSelfTest(provider).fingerprint;
  if (fingerprint !== '855fec9b') {
    throw new Error(`engine fingerprint ${fingerprint} does not match 855fec9b; refusing to seed`);
  }

  const start = Date.UTC(1900, 0, 1);
  const end = Date.UTC(2100, 11, 31);
  const DAY = 86_400_000;
  const total = Math.round((end - start) / DAY) + 1;

  let days: string[] = [];
  let jds: number[] = [];
  let sources: string[] = [];
  let positions: string[] = [];
  let written = 0;

  const flush = async () => {
    if (days.length === 0) return;
    await sql.query(
      `INSERT INTO ephemeris_daily (day, jd_ut, source, positions)
       SELECT * FROM unnest($1::date[], $2::float8[], $3::text[], $4::jsonb[])
       ON CONFLICT (day) DO UPDATE SET jd_ut=EXCLUDED.jd_ut, source=EXCLUDED.source,
         positions=EXCLUDED.positions`,
      [days, jds, sources, positions],
    );
    written += days.length;
    process.stdout.write(`\rephemeris: ${written}/${total}`);
    days = []; jds = []; sources = []; positions = [];
  };

  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    const jd = julianDay(
      { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
      0,
    );
    const calc = provider.calcMany(jd, EPHEMERIS_BODIES, { includeEquatorial: true });
    const record: Record<string, unknown> = {};
    for (const p of calc) {
      record[p.body] = {
        lon: round(p.longitude),
        lat: round(p.latitude),
        speed: round(p.longitudeSpeed),
        dec: p.equatorial ? round(p.equatorial.declination) : null,
        retro: p.retrograde,
      };
    }
    days.push(d.toISOString().slice(0, 10));
    jds.push(jd);
    sources.push(sourceForJd(jd));
    positions.push(JSON.stringify(record));
    if (days.length >= BATCH) await flush();
  }
  await flush();
  provider.close();

  await sql.query(
    `INSERT INTO dataset_meta (name, rows, source, license, detail) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (name) DO UPDATE SET rows=EXCLUDED.rows, source=EXCLUDED.source,
       license=EXCLUDED.license, detail=EXCLUDED.detail, loaded_at=now()`,
    [
      'ephemeris_daily', total, '@astro/engine (Swiss Ephemeris via swisseph-wasm)', null,
      { from: '1900-01-01', to: '2100-12-31', sampledAt: '00:00 UT', zodiac: 'tropical',
        bodies: EPHEMERIS_BODIES, fingerprint },
    ],
  );
  console.log(`\nephemeris: ${total} rows (fingerprint ${fingerprint})`);
}

await migrate();
if (!only || only === 'cities') await seedCities();
if (!only || only === 'ephemeris') await seedEphemeris();

const [counts] = await sql.query(
  `SELECT (SELECT count(*) FROM cities)::int AS cities,
          (SELECT count(*) FROM ephemeris_daily)::int AS ephemeris,
          (SELECT count(*) FROM charts)::int AS charts`,
);
console.log('database now holds:', counts);
