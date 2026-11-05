/**
 * The app's market-data provider.
 *
 * Goes through `/api/prices` on this origin, never straight to the upstream:
 * the CSP is `connect-src 'self'` and "the client makes no external requests"
 * is a property the production smoke test checks. The proxy keeps both true
 * while still letting the reader look a symbol up.
 *
 * The response is parsed with the SAME parser the file import uses, so a
 * fetched series and an imported one are the same object with the same
 * rejected-row reporting. Two parsers would eventually disagree about a
 * decimal comma or a date order, and the study would inherit the difference.
 */
import {
  parseMarketCsv,
  ProviderError,
  isProviderErrorCode,
  type FetchedBars,
  type MarketDataProvider,
  type ProviderDescription,
} from '@astro/research';

/*
 * The upstream is the DEPLOYMENT's choice, set by MARKET_DATA_PROVIDER, so
 * this adapter cannot name it before a request. It names the route instead,
 * and the response reports which provider actually answered.
 */
const DESCRIPTION: ProviderDescription = {
  name: 'the configured provider',
  // Whatever the upstream is, fetching tells it which symbol is being looked
  // at. Declared here so the UI can say so without knowing the provider.
  remote: true,
};

async function readError(response: Response, fallback: string): Promise<never> {
  let code = fallback;
  try {
    const body: unknown = await response.json();
    const candidate = (body as { error?: unknown } | null)?.error;
    if (isProviderErrorCode(candidate)) code = candidate;
  } catch {
    /* a non-JSON error body tells us nothing more than the status did */
  }
  throw new ProviderError(
    isProviderErrorCode(code) ? code : 'PROVIDER_UNAVAILABLE',
    DESCRIPTION.name,
  );
}

export const apiProvider: MarketDataProvider = {
  describe: DESCRIPTION,

  async fetchDaily(symbol: string): Promise<FetchedBars> {
    const response = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) await readError(response, 'PROVIDER_UNAVAILABLE');

    let payload: { csv?: unknown; provider?: unknown };
    try {
      payload = (await response.json()) as { csv?: unknown; provider?: unknown };
    } catch {
      throw new ProviderError('MALFORMED_RESPONSE', DESCRIPTION.name);
    }
    if (typeof payload.csv !== 'string') {
      throw new ProviderError('MALFORMED_RESPONSE', DESCRIPTION.name);
    }

    const parsed = parseMarketCsv(payload.csv, {});
    if (parsed.bars.length === 0) {
      // Distinct from "no such symbol": the provider answered with something
      // CSV-shaped that held no usable rows.
      throw new ProviderError('MALFORMED_RESPONSE', DESCRIPTION.name);
    }
    return {
      bars: parsed.bars,
      ...(typeof payload.provider === 'string' ? { providerName: payload.provider } : {}),
    };
  },
};
