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
 *
 * ## NSE index lists (0.46)
 *
 *   GET /api/prices?list=nifty500   (or nifty50, nifty100, nifty200)
 *
 * The constituents of an NSE index, from NSE's own published files: the
 * index list (`ind_nifty500list.csv`) joined by symbol to the equity list
 * (`EQUITY_L.csv`) for each company's NSE listing date. Both are public CSVs
 * on archives.nseindia.com, read with this app's own user agent; nothing is
 * stored. Without the equity list the stocks still come back, without
 * listing dates, and the answer says so. It lives in this route, not a new
 * one, because the Hobby plan caps the number of functions.
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

// ------------------------------------------------------------------ NSE index lists

const NSE_ARCHIVES = 'https://archives.nseindia.com/content';
const UA = 'astral-studio (+https://astro-beta-khaki.vercel.app)';

/** The index lists offered, and NSE's file for each. A whitelist: the value becomes part of an outbound URL. */
export const NSE_LISTS: Readonly<Record<string, { readonly name: string; readonly file: string }>> = {
  nifty50: { name: 'NIFTY 50', file: 'ind_nifty50list.csv' },
  nifty100: { name: 'NIFTY 100', file: 'ind_nifty100list.csv' },
  nifty200: { name: 'NIFTY 200', file: 'ind_nifty200list.csv' },
  nifty500: { name: 'NIFTY 500', file: 'ind_nifty500list.csv' },
};

const NSE_SYMBOL = /^[A-Z0-9][A-Z0-9&-]{0,19}$/;
const MONTHS: Readonly<Record<string, string>> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** One CSV line into cells. NSE's files are unquoted today; a quoted cell is honoured anyway. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  out.push(cell.trim());
  return out;
}

/** Rows keyed by lower-case, trimmed header names (EQUITY_L.csv pads them with spaces). */
function csvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = csvCells(lines[0]!).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = csvCells(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

/** NSE's `06-OCT-2008` as `2008-10-06`, or null for anything else (and for an impossible date). */
export function nseListingDate(text: string): string | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  const month = m ? MONTHS[m[2]!.toUpperCase()] : undefined;
  if (!m || !month) return null;
  const iso = `${m[3]}-${month}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export interface NseListStock {
  readonly symbol: string;
  readonly name: string;
  readonly industry: string;
  readonly series: string;
  readonly isin: string;
  readonly listed?: string;
}

/**
 * An index list (`Company Name, Industry, Symbol, Series, ISIN Code`) joined
 * to the equity list (`SYMBOL, NAME OF COMPANY, …, DATE OF LISTING, …`).
 * Throws `LIST_MALFORMED` when the index file is not the shape NSE publishes:
 * an error page must not pass for an empty index.
 */
export function joinNseLists(indexCsv: string, equityCsv: string | null): NseListStock[] {
  const index = csvRows(indexCsv);
  if (index.length === 0 || !('symbol' in index[0]!) || !('company name' in index[0]!)) throw new HttpError(502, 'LIST_MALFORMED');
  const listed = new Map<string, string>();
  for (const r of equityCsv ? csvRows(equityCsv) : []) {
    const date = nseListingDate(r['date of listing'] ?? '');
    if (r.symbol && date) listed.set(r.symbol.toUpperCase(), date);
  }
  const seen = new Set<string>();
  const out: NseListStock[] = [];
  for (const r of index) {
    const symbol = (r.symbol ?? '').toUpperCase();
    if (!NSE_SYMBOL.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    const date = listed.get(symbol);
    out.push({
      symbol, name: r['company name'] || symbol, industry: r.industry ?? '', series: r.series ?? '', isin: r['isin code'] ?? '',
      ...(date ? { listed: date } : {}),
    });
  }
  if (out.length === 0) throw new HttpError(502, 'LIST_MALFORMED');
  return out;
}

async function nseFile(path: string): Promise<string> {
  const response = await fetch(`${NSE_ARCHIVES}/${path}`, {
    // A hung NSE server must not hold this function open to its own timeout.
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'text/csv,text/plain', 'user-agent': UA },
  });
  if (!response.ok) throw new HttpError(502, 'LIST_UNAVAILABLE');
  return response.text();
}

async function nseList(request: Request, list: string): Promise<Response> {
  const entry = Object.hasOwn(NSE_LISTS, list) ? NSE_LISTS[list] : undefined;
  if (!entry) throw new HttpError(400, 'LIST_UNKNOWN');
  const indexPath = `indices/${entry.file}`;
  const equityPath = 'equities/EQUITY_L.csv';
  const [index, equity] = await Promise.allSettled([nseFile(indexPath), nseFile(equityPath)]);
  if (index.status === 'rejected') throw index.reason;
  const equityOk = equity.status === 'fulfilled';
  const stocks = joinNseLists(index.value, equityOk ? equity.value : null);
  const readOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return json(request, {
    list, name: entry.name, readOn, stocks,
    sources: [`${NSE_ARCHIVES}/${indexPath}`, ...(equityOk ? [`${NSE_ARCHIVES}/${equityPath}`] : [])],
    ...(equityOk ? {} : { listingDatesUnavailable: true }),
  }, 200, {
    // NSE revises index membership twice a year; a few hours is plenty.
    'cache-control': 'private, max-age=21600',
  });
}

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

    const list = new URL(request.url).searchParams.get('list');
    if (list !== null) return await nseList(request, list.trim().toLowerCase());

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
