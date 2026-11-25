/**
 *   GET /api/prices?symbol=AAPL
 *
 * Daily OHLCV from whichever provider this deployment is configured for,
 * returned as the CSV shape the file import already parses, so one parser
 * handles a file and a fetch alike.
 *
 * ## Why this is a server function rather than a fetch from the page
 *
 * The app's CSP is `connect-src 'self'`, and "the client makes no external
 * requests" is a property the production smoke test checks. Fetching prices
 * from the browser would break both. Proxying keeps the guarantee exactly as
 * it was: the browser talks to this origin, this origin talks to the provider.
 *
 * ## Configuration, and why there is no default
 *
 * `MARKET_DATA_PROVIDER` and, where the provider needs one, `MARKET_DATA_KEY`.
 * With neither set this endpoint answers **PROVIDER_NOT_CONFIGURED** rather
 * than quietly picking a provider: fetching sends the symbol to a third party,
 * and which third party is the deployment's decision, not this file's.
 *
 * `yahoo` (keyless, since 0.44) reads Yahoo Finance's daily chart endpoint. It
 * covers the NSE/BSE indices, stocks and ETFs and the COMEX futures the
 * financial-astrology instruments name, with Yahoo's own symbols (^NSEI,
 * RELIANCE.NS, GC=F). Bars are dated in the exchange's IANA time zone, a day
 * still trading is dropped rather than read as a close, and a day with no
 * close is skipped, never filled. The data is unofficial and has gaps; the
 * calendar reports a gap as a missing session.
 *
 * Stooq was the obvious keyless candidate and is **not** offered. As of
 * November 2026 it answers non-browser clients with a JavaScript
 * proof-of-work challenge instead of data; working around that is
 * circumventing bot detection, so the adapter would be permanently broken and
 * is better absent than present and failing.
 *
 * ## Admins only (0.45)
 *
 * Financial astrology is an admin page, and until 0.45 this route answered
 * anyone, signed in or not: a free, anonymous proxy to the provider on this
 * deployment's quota and reputation, and with `public, s-maxage` the CDN
 * could hand one answer to every caller. It now needs an admin session and
 * its answers are cached privately, in the admin's own browser only.
 */
import { ensureSchema, requireAdmin } from './_auth.js';
import { fail, HttpError, json, preflight } from './_lib.js';

/**
 * Symbols are letters, digits and a few separators.
 *
 * A whitelist, not escaping: this value becomes part of an outbound URL, and
 * a blacklist is the wrong shape of defence for that.
 */
const SYMBOL = /^[A-Za-z0-9^._:=&-]{1,24}$/;

interface Upstream {
  /** Needs `MARKET_DATA_KEY`. */
  readonly keyed: boolean;
  readonly url: (symbol: string, key: string) => string;
  /** True when the body is the CSV we expect rather than an error page. */
  readonly looksRight: (text: string) => boolean;
  /** For a JSON upstream: the body as `date,open,high,low,close,volume` CSV, or null for no data. */
  readonly toCsv?: (text: string, now: number) => string | null;
  /** The upstream answers an unknown symbol with HTTP 404. */
  readonly notFoundIs404?: boolean;
  /** The day the upstream dates the symbol's first trade (exchange-local ISO date), when it says. */
  readonly firstTrade?: (text: string) => string | null;
  readonly accept?: string;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: {
        exchangeTimezoneName?: string;
        firstTradeDate?: number | null;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }> | null;
  };
}

/**
 * The first-trade day Yahoo reports in its own metadata, or null.
 *
 * Yahoo sometimes serves a truncated history: in November 2026 RELIANCE.BO and
 * INFY.BO came back with 8 bars although the same metadata dates their first
 * trade to 1995. The page compares this day with the first bar it received
 * and says so, rather than letting eight days pass as the whole history.
 */
export function yahooFirstTrade(text: string): string | null {
  try {
    const r = (JSON.parse(text) as YahooChart).chart?.result?.[0];
    const first = r?.meta?.firstTradeDate;
    if (typeof first !== 'number' || !Number.isFinite(first)) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: r?.meta?.exchangeTimezoneName ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(first * 1000));
  } catch {
    return null;
  }
}

/**
 * Yahoo chart JSON to CSV. Exported for the tests.
 *
 * - A bar's date is its timestamp's calendar day in the exchange's own IANA
 *   zone, never a fixed offset: a fixed offset moves daylight-saving bars to
 *   the previous day (the 0.42 "Sunday bars").
 * - The current session's bar is dropped while that session is still open:
 *   its "close" is the last trade so far.
 * - A row with no close is skipped. Nothing is interpolated.
 */
export function yahooToCsv(text: string, now: number): string | null {
  let doc: YahooChart;
  try { doc = JSON.parse(text) as YahooChart; } catch { return null; }
  const r = doc.chart?.result?.[0];
  const ts = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!r || !ts || ts.length === 0 || !q?.close) return null;
  const zone = r.meta?.exchangeTimezoneName ?? 'UTC';
  let day: Intl.DateTimeFormat;
  try { day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return null; }
  const regular = r.meta?.currentTradingPeriod?.regular;
  const openUntil = regular?.start !== undefined && regular.end !== undefined && now / 1000 < regular.end ? regular.start : null;
  const num = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(v));
  const rows = new Map<string, string>();
  for (let i = 0; i < ts.length; i++) {
    const close = q.close[i];
    if (close === null || close === undefined || !Number.isFinite(close) || close <= 0) continue;
    if (openUntil !== null && ts[i]! >= openUntil) continue;
    const date = day.format(new Date(ts[i]! * 1000));
    // A repeated date keeps the later row: Yahoo sometimes appends a second stamp for the last session.
    rows.set(date, [date, num(q.open?.[i]), num(q.high?.[i]), num(q.low?.[i]), String(close), num(q.volume?.[i])].join(','));
  }
  if (rows.size === 0) return null;
  return ['date,open,high,low,close,volume', ...[...rows.keys()].sort().map((k) => rows.get(k)!)].join('\n');
}

const UPSTREAMS: Readonly<Record<string, Upstream>> = {
  yahoo: {
    keyed: false,
    url: (symbol) =>
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      // period1=0 with interval=1d: `range=max` silently returns monthly bars.
      + `?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`,
    looksRight: (text) => text.trimStart().startsWith('{'),
    toCsv: yahooToCsv,
    notFoundIs404: true,
    firstTrade: yahooFirstTrade,
    accept: 'application/json',
  },
  alphavantage: {
    keyed: true,
    url: (symbol, key) =>
      'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY'
      + `&symbol=${encodeURIComponent(symbol)}&outputsize=full&datatype=csv&apikey=${key}`,
    // Alpha Vantage answers a bad key or a rate limit with 200 and a JSON
    // note. Treating that as an empty series would show a blank chart for a
    // configuration problem.
    looksRight: (text) => text.slice(0, 120).toLowerCase().startsWith('timestamp,'),
  },
  tiingo: {
    keyed: true,
    url: (symbol, key) =>
      `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`
      + `?format=csv&resampleFreq=daily&token=${key}`,
    looksRight: (text) => text.slice(0, 120).toLowerCase().startsWith('date,'),
  },
};

/** Provider CSV headers differ; the importer wants `date` and `close`. */
function normaliseHeader(text: string): string {
  const [header, ...rows] = text.split(/\r?\n/);
  if (!header) return text;
  const renamed = header
    .split(',')
    .map((name) => (name.trim().toLowerCase() === 'timestamp' ? 'date' : name))
    .join(',');
  return [renamed, ...rows].join('\n');
}

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    await requireAdmin(request);

    const name = (process.env.MARKET_DATA_PROVIDER ?? '').trim().toLowerCase();
    if (!name) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED');

    const upstream = UPSTREAMS[name];
    if (!upstream) throw new HttpError(503, 'PROVIDER_UNKNOWN');

    const key = (process.env.MARKET_DATA_KEY ?? '').trim();
    if (upstream.keyed && !key) throw new HttpError(503, 'PROVIDER_KEY_MISSING');

    const symbol = (new URL(request.url).searchParams.get('symbol') ?? '').trim();
    if (!SYMBOL.test(symbol)) throw new HttpError(400, 'INVALID_SYMBOL');

    const response = await fetch(upstream.url(symbol, key), {
      // A hung upstream must not hold this function open to its own timeout.
      signal: AbortSignal.timeout(10_000),
      headers: { accept: upstream.accept ?? 'text/csv,text/plain', 'user-agent': 'astral-studio (+https://astro-beta-khaki.vercel.app)' },
    });
    if (response.status === 404 && upstream.notFoundIs404) throw new HttpError(404, 'SYMBOL_NOT_FOUND');
    if (!response.ok) throw new HttpError(502, 'PROVIDER_UNAVAILABLE');

    const raw = await response.text();
    if (!upstream.looksRight(raw)) throw new HttpError(404, 'SYMBOL_NOT_FOUND');
    const text = upstream.toCsv ? upstream.toCsv(raw, Date.now()) : raw;
    if (text === null) throw new HttpError(404, 'SYMBOL_NOT_FOUND');
    const firstTrade = upstream.firstTrade?.(raw) ?? null;

    return json(request, {
      symbol,
      provider: name,
      csv: normaliseHeader(text),
      ...(firstTrade ? { firstTrade } : {}),
      notice: `Fetched server-side from ${name}. Data quality and terms are the provider’s.`,
    }, 200, {
      // A daily series changes once a day. Re-fetching per keystroke would be
      // rude to the provider and, on a keyed plan, expensive. Private: the
      // answer is for a signed-in admin, never for a shared cache (0.45).
      'cache-control': 'private, max-age=900',
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'TimeoutError') {
      return fail(request, new HttpError(504, 'PROVIDER_TIMEOUT'));
    }
    return fail(request, cause);
  }
}
