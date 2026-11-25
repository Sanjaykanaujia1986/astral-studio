/**
 * The Yahoo adapter behind /api/prices, on synthetic chart JSON. No market
 * data is stored in this repository; these numbers are made up.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useDatabaseForTests } from '../../../api/_lib.js';
import { resetSchemaCacheForTests } from '../../../api/_auth.js';
import * as auth from '../../../api/auth.js';
import * as prices from '../../../api/prices.js';

const at = (iso: string): number => Date.parse(iso) / 1000;

function chart(zone: string, stamps: number[], closes: (number | null)[], regular?: { start: number; end: number }, firstTradeDate?: number): string {
  return JSON.stringify({
    chart: {
      result: [{
        meta: { exchangeTimezoneName: zone, ...(regular ? { currentTradingPeriod: { regular } } : {}), ...(firstTradeDate !== undefined ? { firstTradeDate } : {}) },
        timestamp: stamps,
        indicators: { quote: [{ open: closes, high: closes, low: closes, close: closes, volume: closes.map(() => 1000) }] },
      }],
      error: null,
    },
  });
}

describe('yahooToCsv', () => {
  it('dates NSE bars in Asia/Kolkata: the 09:15 IST stamp is 03:45 UTC on the same day', () => {
    const csv = prices.yahooToCsv(chart('Asia/Kolkata', [at('2026-11-20T03:45:00Z'), at('2026-11-23T03:45:00Z')], [100, 101]), at('2026-11-24T12:00:00Z') * 1000)!;
    expect(csv.split('\n')).toEqual(['date,open,high,low,close,volume', '2026-11-20,100,100,100,100,1000', '2026-11-23,101,101,101,101,1000']);
  });
  it('dates COMEX bars in America/New_York across daylight saving, never a fixed offset', () => {
    // Midnight New York in July is 04:00 UTC; in January it is 05:00 UTC.
    const csv = prices.yahooToCsv(chart('America/New_York', [at('2026-07-10T04:00:00Z'), at('2026-01-09T05:00:00Z')], [10, 11]), Date.parse('2026-11-24T00:00:00Z'))!;
    expect(csv).toContain('2026-07-10,');
    expect(csv).toContain('2026-01-09,');
    expect(csv).not.toContain('2026-07-09');
  });
  it('drops the bar of a session that is still trading, keeps it once the session has closed', () => {
    const regular = { start: at('2026-11-25T03:45:00Z'), end: at('2026-11-25T10:00:00Z') };
    const body = chart('Asia/Kolkata', [at('2026-11-24T03:45:00Z'), at('2026-11-25T07:21:00Z')], [100, 102], regular);
    expect(prices.yahooToCsv(body, Date.parse('2026-11-25T07:30:00Z'))).not.toContain('2026-11-25');
    expect(prices.yahooToCsv(body, Date.parse('2026-11-25T11:00:00Z'))).toContain('2026-11-25,102');
  });
  it('skips a day with no close instead of filling it, and answers null for no data', () => {
    const csv = prices.yahooToCsv(chart('Asia/Kolkata', [at('2026-11-19T03:45:00Z'), at('2026-11-20T03:45:00Z')], [null, 100]), Date.now())!;
    expect(csv.split('\n')).toHaveLength(2);
    expect(prices.yahooToCsv('{"chart":{"result":null}}', Date.now())).toBeNull();
    expect(prices.yahooToCsv('not json', Date.now())).toBeNull();
  });
});

describe('yahooFirstTrade', () => {
  it('reads the first-trade day in the exchange zone, so a cut-short history can be told apart', () => {
    // 1995-07-10 09:15 IST is 03:45 UTC the same day; a fixed UTC reading of 1995-07-09T22:00Z would say the 9th.
    expect(prices.yahooFirstTrade(chart('Asia/Kolkata', [at('2026-11-13T03:45:00Z')], [100], undefined, at('1995-07-09T22:00:00Z')))).toBe('1995-07-10');
    expect(prices.yahooFirstTrade(chart('Asia/Kolkata', [at('2026-11-13T03:45:00Z')], [100]))).toBeNull();
    expect(prices.yahooFirstTrade('not json')).toBeNull();
  });
});

/*
 * The route itself, against an in-process Postgres so the admin gate is real.
 * Every account here is synthetic.
 */
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  const schema = readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await pg.exec(schema);
  useDatabaseForTests({ query: async (text, params) => (await pg.query(text, params ? [...params] : [])).rows as Record<string, unknown>[] });
  resetSchemaCacheForTests();
  process.env.ADMIN_EMAILS = 'prices-admin@example.com';
});
afterAll(async () => {
  useDatabaseForTests(undefined);
  await pg.close();
});

const BIRTH = {
  date: { year: 1990, month: 1, day: 15 }, time: { hour: 9, minute: 30 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' }, place: { latitude: 19, longitude: 73, label: 'Testpur' },
};

/** A session cookie for a freshly registered synthetic account. */
async function signUp(email: string): Promise<string> {
  const res = await auth.POST(new Request('https://x.test/api/auth?action=register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery', name: 'Test Person', birth: BIRTH }),
  }));
  expect(res.status).toBe(201);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const get = (path: string, cookie?: string): Promise<Response> =>
  prices.GET(new Request(`https://x.test${path}`, cookie ? { headers: { cookie } } : {}));

describe('GET /api/prices with MARKET_DATA_PROVIDER=yahoo', () => {
  let admin = '';
  let customer = '';
  beforeAll(async () => {
    admin = await signUp('prices-admin@example.com');
    customer = await signUp('prices-customer@example.com');
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.MARKET_DATA_PROVIDER; });

  it('answers only an admin: signed out is 401, a customer 403, and the provider is never asked (0.45)', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    let asked = 0;
    vi.stubGlobal('fetch', async () => { asked += 1; return new Response(chart('Asia/Kolkata', [at('2026-11-20T03:45:00Z')], [100]), { status: 200 }); });
    const anonymous = await get('/api/prices?symbol=%5ENSEI');
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'SIGN_IN_REQUIRED' });
    const asCustomer = await get('/api/prices?symbol=%5ENSEI', customer);
    expect(asCustomer.status).toBe(403);
    expect(await asCustomer.json()).toEqual({ error: 'ADMIN_ONLY' });
    expect(asked).toBe(0);
    const asAdmin = await get('/api/prices?symbol=%5ENSEI', admin);
    expect(asAdmin.status).toBe(200);
    // Never a shared cache: the answer belongs to one signed-in admin.
    expect(asAdmin.headers.get('cache-control')).toBe('private, max-age=900');
    expect(asked).toBe(1);
  });

  it('accepts Yahoo symbols such as GC=F and M&M.NS, and reports the provider and its first-trade day', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return new Response(chart('America/New_York', [at('2026-11-20T05:00:00Z')], [2000], undefined, at('2000-08-30T04:00:00Z')), { status: 200 });
    });
    for (const symbol of ['GC=F', 'M&M.NS', '^NSEI']) {
      const res = await get(`/api/prices?symbol=${encodeURIComponent(symbol)}`, admin);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { provider: string; csv: string; firstTrade?: string };
      expect(body.provider).toBe('yahoo');
      expect(body.csv).toContain('2026-11-20,');
      expect(body.firstTrade).toBe('2000-08-30');
    }
    expect(seen[0]).toContain('/v8/finance/chart/GC%3DF?period1=0');
    expect(seen[0]).toContain('interval=1d');
  });
  it('maps an unknown symbol to SYMBOL_NOT_FOUND and an outage to PROVIDER_UNAVAILABLE', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    vi.stubGlobal('fetch', async () => new Response('{"chart":{"result":null}}', { status: 404 }));
    expect((await (await get('/api/prices?symbol=XXXX.NS', admin)).json())).toEqual({ error: 'SYMBOL_NOT_FOUND' });
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 500 }));
    expect((await (await get('/api/prices?symbol=RELIANCE.NS', admin)).json())).toEqual({ error: 'PROVIDER_UNAVAILABLE' });
  });
  it('still refuses a symbol outside the whitelist', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    const res = await get('/api/prices?symbol=' + encodeURIComponent('a/b?c'), admin);
    expect(res.status).toBe(400);
  });
});
