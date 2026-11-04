/**
 * Builds the bundled city database from the GeoNames dump.
 *
 * Source: https://download.geonames.org/export/dump/ — Creative Commons
 * Attribution 4.0. Attribution is carried in the app and in docs/LICENSING.md.
 *
 * Run: npm run build:data -w packages/locations
 *
 * The output is a columnar JSON payload rather than an array of objects.
 * Repeated strings (time zones, country codes) are interned into tables and
 * referenced by index, and coordinates are stored as integers scaled by 1e4.
 * For ~55,000 towns that is the difference between a payload the app can ship
 * offline and one it cannot.
 *
 * 1e-4 degrees is ~11 m, and 1e-4 degrees of longitude is 0.024 seconds of
 * sidereal time — far below the precision to which any birth time is known, so
 * the truncation costs nothing astrologically.
 */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const OUT_DIR = join(ROOT, 'data');
const BASE = 'https://download.geonames.org/export/dump';

/** cities5000: every populated place above 5,000 people (~55k rows). */
const CITIES_ARCHIVE = process.env.GEONAMES_SET ?? 'cities5000';

async function fetchCached(name) {
  await mkdir(CACHE, { recursive: true });
  const target = join(CACHE, name);
  try {
    const s = await stat(target);
    if (s.size > 0) {
      console.log(`cache ${name} (${(s.size / 1048576).toFixed(2)} MB)`);
      return readFile(target);
    }
  } catch {
    /* not cached */
  }
  process.stdout.write(`fetch ${name} ... `);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`failed to fetch ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  console.log(`ok (${(buf.length / 1048576).toFixed(2)} MB)`);
  return buf;
}

/** GeoNames columns we use from the cities dump. */
const COL = {
  name: 1,
  asciiName: 2,
  alternateNames: 3,
  latitude: 4,
  longitude: 5,
  featureClass: 6,
  countryCode: 8,
  admin1: 10,
  population: 14,
  timezone: 17,
};

async function main() {
  const [citiesZip, admin1Raw, countryRaw] = await Promise.all([
    fetchCached(`${CITIES_ARCHIVE}.zip`),
    fetchCached('admin1CodesASCII.txt'),
    fetchCached('countryInfo.txt'),
  ]);

  // --- country names -------------------------------------------------------
  const countryNames = new Map();
  for (const raw of strFromU8(new Uint8Array(countryRaw)).split('\n')) {
    if (!raw || raw.startsWith('#')) continue;
    const cols = raw.split('\t');
    if (cols.length > 4 && cols[0]) countryNames.set(cols[0], cols[4]);
  }

  // --- admin1 (state / province) names --------------------------------------
  const admin1Names = new Map();
  for (const raw of strFromU8(new Uint8Array(admin1Raw)).split('\n')) {
    if (!raw) continue;
    const cols = raw.split('\t');
    if (cols.length > 1 && cols[0]) admin1Names.set(cols[0], cols[1]);
  }

  // --- cities ---------------------------------------------------------------
  const unzipped = unzipSync(new Uint8Array(citiesZip));
  const entryName = Object.keys(unzipped).find((k) => k.endsWith('.txt'));
  if (!entryName) throw new Error('no .txt entry inside the cities archive');
  const text = strFromU8(unzipped[entryName]);

  const timezones = [];
  const timezoneIndex = new Map();
  const countries = [];
  const countryIndex = new Map();

  const intern = (value, list, index) => {
    let i = index.get(value);
    if (i === undefined) {
      i = list.length;
      list.push(value);
      index.set(value, i);
    }
    return i;
  };

  const cities = [];
  let skipped = 0;

  for (const raw of text.split('\n')) {
    if (!raw) continue;
    const c = raw.split('\t');
    if (c.length < 18) continue;

    // Feature class P is "populated place". Anything else is not a birthplace.
    if (c[COL.featureClass] !== 'P') { skipped++; continue; }

    const timezone = c[COL.timezone];
    const countryCode = c[COL.countryCode];
    const latitude = Number(c[COL.latitude]);
    const longitude = Number(c[COL.longitude]);

    // A city with no time zone cannot produce a correct chart, so it is dropped
    // rather than shipped with a guess.
    if (!timezone || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      skipped++;
      continue;
    }

    cities.push([
      c[COL.name],
      Math.round(latitude * 1e4),
      Math.round(longitude * 1e4),
      intern(timezone, timezones, timezoneIndex),
      intern(countryCode, countries, countryIndex),
      c[COL.admin1] || '',
      Number(c[COL.population]) || 0,
    ]);
  }

  // Most populous first: the common case is that someone typing "London" wants
  // the large one, and a stable order keeps search results deterministic.
  cities.sort((a, b) => b[6] - a[6]);

  const admin1 = {};
  for (const city of cities) {
    const key = `${countries[city[4]]}.${city[5]}`;
    if (city[5] && !admin1[key] && admin1Names.has(key)) admin1[key] = admin1Names.get(key);
  }

  const payload = {
    version: 1,
    source: `GeoNames ${CITIES_ARCHIVE}`,
    license: 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
    generated: new Date().toISOString().slice(0, 10),
    coordinateScale: 1e4,
    timezones,
    countries,
    countryNames: Object.fromEntries(countries.map((cc) => [cc, countryNames.get(cc) ?? cc])),
    admin1,
    cities,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const target = join(OUT_DIR, 'cities.json');
  const json = JSON.stringify(payload);
  await writeFile(target, json, 'utf8');

  console.log('');
  console.log(`cities kept     : ${cities.length.toLocaleString()}`);
  console.log(`rows skipped    : ${skipped.toLocaleString()} (non-populated or missing time zone)`);
  console.log(`time zones      : ${timezones.length}`);
  console.log(`countries       : ${countries.length}`);
  console.log(`payload         : ${(json.length / 1048576).toFixed(2)} MB uncompressed`);
  console.log(`written         : ${target}`);
}

await main();
