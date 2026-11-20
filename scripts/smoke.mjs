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
 * It writes nothing. The private endpoints are checked from outside, as an
 * anonymous visitor, a forged session and a stale device key; the account
 * rules behind them are tested end to end in packages/api-tests.
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
  /*
   * Code-split: the entry chunk names the lazy route chunks, and translations
   * and page text live there (src-*.js, VedicPanel-*.js), not in index-*.js.
   * Crawl every chunk reachable from the entry and search them together.
   */
  const seen = new Set();
  const queue = [bundle];
  let js = '';
  while (queue.length > 0 && seen.size < 60) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const text = await fetchOnce(`/assets/${name}`).then((r) => (r.ok ? r.text() : ''));
    js += text;
    for (const m of text.matchAll(/([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js)/g)) if (!seen.has(m[1])) queue.push(m[1]);
  }
  check('bundle chunks crawled', seen.size > 1, `${seen.size} chunks`);
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
    ['matching and yogas (0.21)', 'Matching (aṣṭakūṭa)'],
    ['KP, aṣṭakavarga and ṣaḍbala (0.22)', 'Krishnamurti Paddhati (KP)'],
    ['varṣaphal and progressions (0.23)', 'Varṣaphal and progressions'],
    ['tables, sāyana pages, transits and KP events (0.24)', 'Daily transits and gochar'],
    ['Hindi and Gujarati Jyotiṣa terms (0.25)', 'vedic.yoga.why.'],
    ['drawn zodiac glyphs (0.26)', 'data-glyph'],
    ['planet colours (0.27)', 'as-pl-sun'],
    ['Earth symbol (0.27.1)', 'as-pl-earth'],
    ['Vedic horoscope print (0.28)', 'report.vedic.antardasha'],
    ['Complete kundli booklet (0.29)', 'kundli.pratyantarNote'],
    ['Yearly varsha charts (0.29.1)', 'kundli.varshaCharts'],
    ['Kundli particulars, Jaimini and bindu charts (0.30)', 'kundli.page.jaiminiCharts'],
    ['Kundli readings, Sarvatobhadra, remedies (0.31)', 'kundli.page.sbc'],
    ['Bhāva kuṇḍalī functional labels (0.32)', 'kundli.fn.note'],
    ['Ṣoḍaśavarga aṣṭakavarga charts (0.33)', 'kundli.vargaAvNote'],
    ['Kundli readings (phala) (0.34)', 'kundli.ph.note'],
    ['Kundli glance, gemstones, KP favourable points (0.35)', 'kundli.ratna.intro'],
    ['Report preview fits the window (0.36)', 'data-report-zoom'],
    ['Reviewed Hindi catalogue (0.36)', 'निरयन भोगांश पर ज्योतिष'],
    ['Your day on the dashboard (0.37)', 'data-day-panel'],
    ['Sign-in, customer details and the admin list (0.38)', 'data-admin-users'],
    ['Day charts: natal wheel, North and South Indian (0.38)', 'data-day-chart'],
    ['Day chart kept to a readable size (0.38.1)', 'max-w-[440px]'],
    ['Kundli contents page with links and page numbers (0.39)', 'k-toc-part'],
    ['Kundli framed cover with birth-details strip (0.40)', 'k-cover-birth'],
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
check('schema migrated', health.body?.schema_version >= 1, String(health.body?.schema_version));

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

// ------------------------------------------------------- accounts & access
/*
 * Since 0.38 everything sits behind a sign-in: saved charts are the admin's,
 * and a customer reaches only their own details. The smoke test holds no
 * account, so it checks the doors from outside: every private endpoint
 * refuses an anonymous caller, the old device key no longer opens anything,
 * and a forged session cookie is nobody. It creates nothing in the database.
 */
section('Accounts and access');
const me = await json('/api/auth?action=me');
check('signed-out visitor is nobody', me.status === 200 && me.body?.user === null, JSON.stringify(me.body));
const forged = await json('/api/auth?action=me', { headers: { cookie: `astro_session=${randomBytes(32).toString('hex')}` } });
check('a forged session cookie is nobody', forged.status === 200 && forged.body?.user === null);

const deviceKey = { 'x-astro-owner': randomBytes(32).toString('hex') };
check('saved charts need a sign-in', (await json('/api/charts')).status === 401);
check('the old device key no longer opens charts',
  (await json('/api/charts', { headers: deviceKey })).status === 401);
check('the admin list needs a sign-in', (await json('/api/admin?action=users')).status === 401);
check('a customer request list needs a sign-in', (await json('/api/auth?action=requests')).status === 401);
check('writes must be JSON (no form posts from other sites)',
  (await json('/api/auth?action=login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status === 415);
const wrong = await json('/api/auth?action=login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `nobody-${randomBytes(6).toString('hex')}@smoke.invalid`, password: 'not-a-real-password' }),
});
check('an unknown email is refused without saying which half was wrong',
  wrong.status === 401 && wrong.body?.error === 'WRONG_EMAIL_OR_PASSWORD', `${wrong.status} ${wrong.body?.error}`);
check('a half-filled registration is refused',
  (await json('/api/auth?action=register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@smoke.invalid' }) })).status === 422);
check('accounts schema migrated', (await json('/api/health')).body?.schema_version === 2);

// ---------------------------------------------------------------- summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
