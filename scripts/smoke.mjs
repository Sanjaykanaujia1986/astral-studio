/**
 * Production smoke test.
 *
 *   node scripts/smoke.mjs                       # against the live deployment
 *   node scripts/smoke.mjs http://localhost:3000 # against anything else
 *
 * Exercises the DEPLOYED system — routes, API, database, headers and access
 * isolation — and prints a pass/fail line per check.
 *
 * ## Why this exists separately from the unit tests
 *
 * The 766 unit tests prove the code is correct. They cannot prove the thing
 * that is actually serving traffic is the code they tested, that the database
 * is reachable from the functions, that the CDN is returning the right headers,
 * or that one visitor cannot read another's charts. Every one of those has
 * failed at least once in this project's history, and none of them would have
 * been caught by a green test run:
 *
 *   - a deploy that silently did not happen, leaving an old build live
 *   - a non-JSON 200 that crashed a panel
 *   - a header the browser rejected
 *
 * So this talks to the real deployment over HTTP and checks what is true of it
 * right now.
 *
 * It creates and then DELETES one chart under a throwaway owner key, and
 * verifies the deletion. It never touches anyone else's data: the owner key is
 * random per run, and the isolation check relies on that.
 */
import { randomBytes } from 'node:crypto';

const BASE = (process.argv[2] ?? 'https://astro-beta-khaki.vercel.app').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/**
 * Fetch with one retry on a transient failure.
 *
 * Added after the first run immediately following a deploy crashed with a
 * stack trace: for a few seconds the edge can answer with a cold-start error
 * or a deployment page rather than the function's JSON. A verification tool
 * that dies on that is worse than useless — it reports nothing at all, and the
 * natural reaction is to re-run it until it looks fine.
 *
 * So a transient is retried once, and anything still wrong becomes a FAIL with
 * its reason rather than an exception.
 */
async function fetchOnce(path, init) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${BASE}${path}`, init);
      if (response.status < 500 || attempt === 1) return response;
    } catch (cause) {
      if (attempt === 1) throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('unreachable');
}

const json = async (path, init) => {
  try {
    const response = await fetchOnce(path, init);
    let body = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body is a result, not a crash — it is precisely the failure
      // that broke the saved-charts panel in 0.4.0.
      body = null;
    }
    return { status: response.status, body, headers: response.headers };
  } catch (cause) {
    return { status: 0, body: null, headers: new Headers(), error: String(cause) };
  }
};

console.log(`Astral Studio smoke test\n${BASE}`);

// ---------------------------------------------------------------- routes
section('Routes');
const ROUTES = [
  '/', '/chart', '/relationships', '/events', '/calendar', '/vedic',
  '/gann', '/research', '/clients', '/reports', '/settings',
];
for (const route of ROUTES) {
  const response = await fetchOnce(`${route}`);
  const html = await response.text();
  // Every route must serve the app shell, not a 404 page. The SPA rewrite is
  // what makes a deep link work; without it a refresh on /chart 404s.
  check(
    `${route} serves the app`,
    response.status === 200 && html.includes('<div id="root">'),
    `${response.status}`,
  );
}

// ----------------------------------------------------------- the build
section('Build identity');
const index = await fetchOnce(`/?cb=${Date.now()}`).then((r) => r.text());
const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(index)?.[1];
check('index.html references a hashed bundle', Boolean(bundle), bundle ?? 'none');

if (bundle) {
  const js = await fetchOnce(`/assets/${bundle}`).then((r) => r.text());
  // Markers for the features this release is supposed to contain. A deploy
  // that silently did not happen shows up here, not in a green test run.
  for (const [label, marker] of [
    ['workspace shell', 'as-rail'],
    ['brand', 'Astral Studio'],
    ['mean lunar node', 'meanSouthNode'],
    ['planned workspaces', 'Gann'],
    ['vedic module', '/vedic'],
    ['gann lab', 'Square of Nine'],
    ['dashboard', 'Today’s sky'],
    ['daśā systems and sāḍe-sātī (0.20)', 'Śani sāḍe-sātī and transits'],
    // AGPL §13: the source offer must reach the served bundle, not just the repo.
    ['licence notice', 'Affero'],
  ]) {
    check(`bundle contains ${label}`, js.includes(marker));
  }
}

// ----------------------------------------------------------- bundled assets
section('Bundled assets');
for (const [path, minBytes] of [
  ['/wasm/swisseph.wasm', 500_000],
  ['/wasm/swisseph.data', 2_000_000],
  ['/data/cities.json', 3_000_000],
]) {
  /*
   * The body is downloaded and measured rather than trusting content-length.
   *
   * Node's fetch advertises gzip, and undici strips content-length after
   * decompressing — so reading the header reported 0 bytes for files that were
   * served perfectly. (curl -I shows the header because it does not ask for
   * compression unless told to.) Counting the bytes also proves the file is
   * genuinely retrievable, which a header alone does not.
   */
  const response = await fetchOnce(path);
  const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
  check(`${path} served`, response.ok && bytes >= minBytes, `${(bytes / 1048576).toFixed(2)} MB`);
}
const wasmType = (await fetchOnce('/wasm/swisseph.wasm')).headers.get('content-type');
// The wrong MIME breaks WebAssembly.instantiateStreaming; a loader that falls
// back to arrayBuffer would hide it.
check('swisseph.wasm is application/wasm', wasmType === 'application/wasm', wasmType ?? 'none');

// ---------------------------------------------------------------- headers
section('Security headers');
const headers = (await fetchOnce('/')).headers;
const csp = headers.get('content-security-policy') ?? '';
check('CSP present', csp.length > 0);
check("CSP has connect-src 'self'", csp.includes("connect-src 'self'"), 'blocks exfiltration');
check("CSP has frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"), 'header-only directive');
check('CSP allows wasm', csp.includes('wasm-unsafe-eval'));
check('nosniff', headers.get('x-content-type-options') === 'nosniff');
check('no referrer leakage', headers.get('referrer-policy') === 'no-referrer');
check('framing denied', headers.get('x-frame-options') === 'DENY');

// ---------------------------------------------------------------- database
section('Database');
const health = await json('/api/health');
check('health responds', health.status === 200 && health.body?.ok === true);
check('cities loaded', health.body?.cities === 69_641, String(health.body?.cities));
check('ephemeris loaded', health.body?.ephemeris_days === 73_414, String(health.body?.ephemeris_days));
check('schema at version 1', health.body?.schema_version === 1);

// ---------------------------------------------------------------- city search
section('City search');
const zurich = await json('/api/cities?q=zurich&limit=3');
check('diacritic-folded search finds Zürich',
  zurich.body?.cities?.[0]?.name === 'Zürich',
  zurich.body?.cities?.[0]?.name);
check('city carries its timezone',
  zurich.body?.cities?.[0]?.timezone === 'Europe/Zurich');
check('GeoNames attribution returned',
  typeof zurich.body?.attribution === 'string' && zurich.body.attribution.includes('GeoNames'));
check('short query rejected', (await json('/api/cities?q=z')).status === 400);

// ---------------------------------------------------------------- ephemeris
section('Ephemeris API');
const equinox = await json('/api/ephemeris?date=2024-03-20');
const sun = equinox.body?.days?.[0]?.positions?.sun;
check('returns the requested day', equinox.body?.days?.[0]?.day === '2024-03-20');
// The March equinox is hours after 00:00 UT on the 20th, so the Sun is still a
// fraction of a degree short of 0° Aries — i.e. just under 360.
check('Sun near 0° Aries at the equinox',
  typeof sun?.lon === 'number' && sun.lon > 359.5 && sun.lon < 360,
  `${sun?.lon}°`);
check('Swiss ephemeris, not Moshier', equinox.body?.days?.[0]?.source === 'swiss');
check('range cap enforced',
  (await json('/api/ephemeris?from=2020-01-01&to=2024-01-01')).status === 400);

// ------------------------------------------------------- charts & isolation
section('Saved charts and access isolation');
const keyA = randomBytes(32).toString('hex');
const keyB = randomBytes(32).toString('hex');
const owner = (key) => ({ 'x-astro-owner': key, 'content-type': 'application/json' });

check('no owner key is rejected', (await json('/api/charts')).status === 401);
check('a malformed owner key is rejected',
  (await json('/api/charts', { headers: { 'x-astro-owner': 'short' } })).status === 401);

const created = await json('/api/charts', {
  method: 'POST',
  headers: owner(keyA),
  body: JSON.stringify({
    name: 'smoke-test (deleted automatically)',
    birth: {
      date: { year: 1990, month: 1, day: 15 },
      time: { hour: 14, minute: 30 },
      zone: { kind: 'iana', zone: 'Asia/Kolkata' },
      place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai' },
    },
    settings: { houseSystem: 'placidus', nodeType: 'mean' },
    summary: { sun: 'capricorn' },
    engineFingerprint: '855fec9b',
  }),
});
const chartId = created.body?.chart?.id;
check('chart saves', created.status === 201 && Boolean(chartId));

const listA = await json('/api/charts', { headers: owner(keyA) });
check('owner sees their chart',
  listA.body?.charts?.some((c) => c.id === chartId));

const listB = await json('/api/charts', { headers: owner(keyB) });
check('a different key sees nothing',
  Array.isArray(listB.body?.charts) && listB.body.charts.length === 0,
  `${listB.body?.charts?.length ?? '?'} charts`);

if (chartId) {
  // The decisive isolation test: knowing the id must not be enough.
  const stolen = await json(`/api/charts?id=${chartId}`, { headers: owner(keyB) });
  check('a different key cannot fetch it by id', stolen.status === 404, String(stolen.status));

  const settings = await json(`/api/charts?id=${chartId}`, { headers: owner(keyA) });
  check('settings round-trip intact',
    settings.body?.chart?.settings?.nodeType === 'mean');
}

check('invalid chart rejected',
  (await json('/api/charts', {
    method: 'POST', headers: owner(keyA), body: JSON.stringify({ name: '' }),
  })).status === 422);
check('invalid id rejected',
  (await json('/api/charts?id=not-a-uuid', { headers: owner(keyA) })).status === 400);

if (chartId) {
  const deleted = await json(`/api/charts?id=${chartId}`, { method: 'DELETE', headers: owner(keyA) });
  check('chart deletes', deleted.status === 200 && deleted.body?.deleted === chartId);
  check('deleting twice is a 404, not a silent success',
    (await json(`/api/charts?id=${chartId}`, { method: 'DELETE', headers: owner(keyA) })).status === 404);
  const after = await json('/api/charts', { headers: owner(keyA) });
  check('cleaned up after itself', after.body?.charts?.length === 0);
}

// ---------------------------------------------------------------- summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
