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
 * Stooq was the obvious keyless candidate and is **not** offered. As of
 * November 2026 it answers non-browser clients with a JavaScript
 * proof-of-work challenge instead of data; working around that is
 * circumventing bot detection, so the adapter would be permanently broken and
 * is better absent than present and failing.
 */
import { fail, HttpError, json, preflight } from './_lib.js';

/**
 * Symbols are letters, digits and a few separators.
 *
 * A whitelist, not escaping: this value becomes part of an outbound URL, and
 * a blacklist is the wrong shape of defence for that.
 */
const SYMBOL = /^[A-Za-z0-9^._:-]{1,24}$/;

interface Upstream {
  /** Needs `MARKET_DATA_KEY`. */
  readonly keyed: boolean;
  readonly url: (symbol: string, key: string) => string;
  /** True when the body is the CSV we expect rather than an error page. */
  readonly looksRight: (text: string) => boolean;
}

const UPSTREAMS: Readonly<Record<string, Upstream>> = {
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
      headers: { accept: 'text/csv,text/plain' },
    });
    if (!response.ok) throw new HttpError(502, 'PROVIDER_UNAVAILABLE');

    const text = await response.text();
    if (!upstream.looksRight(text)) throw new HttpError(404, 'SYMBOL_NOT_FOUND');

    return json(request, {
      symbol,
      provider: name,
      csv: normaliseHeader(text),
      notice: `Fetched server-side from ${name}. Data quality and terms are the provider’s.`,
    }, 200, {
      // A daily series changes once a day. Re-fetching per keystroke would be
      // rude to the provider and, on a keyed plan, expensive.
      'cache-control': 'public, max-age=900, s-maxage=3600',
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'TimeoutError') {
      return fail(request, new HttpError(504, 'PROVIDER_TIMEOUT'));
    }
    return fail(request, cause);
  }
}
