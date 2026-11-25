/**
 * The Yahoo adapter behind /api/prices, on synthetic chart JSON. No market
 * data is stored in this repository; these numbers are made up.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as prices from '../../../api/prices.js';

const at = (iso: string): number => Date.parse(iso) / 1000;

function chart(zone: string, stamps: number[], closes: (number | null)[], regular?: { start: number; end: number }): string {
  return JSON.stringify({
    chart: {
      result: [{
        meta: { exchangeTimezoneName: zone, ...(regular ? { currentTradingPeriod: { regular } } : {}) },
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

describe('GET /api/prices with MARKET_DATA_PROVIDER=yahoo', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.MARKET_DATA_PROVIDER; });

  it('accepts Yahoo symbols such as GC=F and M&M.NS, and reports the provider', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return new Response(chart('America/New_York', [at('2026-11-20T05:00:00Z')], [2000]), { status: 200 });
    });
    for (const symbol of ['GC=F', 'M&M.NS', '^NSEI']) {
      const res = await prices.GET(new Request(`https://x.test/api/prices?symbol=${encodeURIComponent(symbol)}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { provider: string; csv: string };
      expect(body.provider).toBe('yahoo');
      expect(body.csv).toContain('2026-11-20,');
    }
    expect(seen[0]).toContain('/v8/finance/chart/GC%3DF?period1=0');
    expect(seen[0]).toContain('interval=1d');
  });
  it('maps an unknown symbol to SYMBOL_NOT_FOUND and an outage to PROVIDER_UNAVAILABLE', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    vi.stubGlobal('fetch', async () => new Response('{"chart":{"result":null}}', { status: 404 }));
    expect((await (await prices.GET(new Request('https://x.test/api/prices?symbol=XXXX.NS'))).json())).toEqual({ error: 'SYMBOL_NOT_FOUND' });
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 500 }));
    expect((await (await prices.GET(new Request('https://x.test/api/prices?symbol=RELIANCE.NS'))).json())).toEqual({ error: 'PROVIDER_UNAVAILABLE' });
  });
  it('still refuses a symbol outside the whitelist', async () => {
    process.env.MARKET_DATA_PROVIDER = 'yahoo';
    const res = await prices.GET(new Request('https://x.test/api/prices?symbol=' + encodeURIComponent('a/b?c')));
    expect(res.status).toBe(400);
  });
});
