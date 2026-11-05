/**
 * Market-data providers.
 *
 * An adapter interface and nothing else: this module contains no provider,
 * no endpoint and no credentials. A provider is passed in, so swapping one
 * for another is a change at the call site rather than inside the research
 * code — which matters, because the research code is the part whose results
 * must not depend on where the prices came from.
 *
 * ## What a provider is required to say
 *
 * Its own **name**, and whether a request leaves the machine. A series whose
 * origin is not recorded cannot be reproduced, and "I downloaded it from
 * somewhere" is not a provenance. `Series` carries the symbol; this carries
 * the rest.
 */
import type { Bar } from './csv.js';
import type { Series } from './series.js';

export interface ProviderDescription {
  /** Shown to the reader. The provider's own name, not a nickname. */
  readonly name: string;
  /**
   * True when fetching sends the symbol off this machine.
   *
   * Declared rather than inferred: a reader deciding whether to look
   * something up is entitled to know that looking is itself visible.
   */
  readonly remote: boolean;
  /** Where the terms and coverage are documented. */
  readonly termsUrl?: string;
}

export interface FetchedSeries {
  readonly series: Series;
  readonly provider: ProviderDescription;
  /** Rows the parser could not use, carried through rather than swallowed. */
  readonly rejected: number;
  readonly fetchedIso: string;
}

export interface FetchedBars {
  readonly bars: readonly Bar[];
  /**
   * The provider that actually served the request.
   *
   * Reported back rather than assumed, because with a proxied adapter the
   * deployment chooses the upstream and only the response knows which one
   * answered. Recording the wrong name is worse than recording none.
   */
  readonly providerName?: string;
}

export interface MarketDataProvider {
  readonly describe: ProviderDescription;
  /**
   * Daily bars for a symbol.
   *
   * Throws {@link ProviderError} rather than returning an empty series for an
   * unknown symbol: an empty chart reads as "this has no history", which is a
   * different and much more misleading claim than "no such symbol".
   */
  fetchDaily(symbol: string): Promise<FetchedBars>;
}

export type ProviderErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_UNKNOWN'
  | 'PROVIDER_KEY_MISSING'
  | 'INVALID_SYMBOL'
  | 'SYMBOL_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'MALFORMED_RESPONSE';

export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly provider: string) {
    super(`${provider}: ${code}`);
    this.name = 'ProviderError';
  }
}

/** Codes a caller can translate. Anything else is a bug, not a condition. */
export const PROVIDER_ERROR_CODES: ReadonlySet<string> = new Set<ProviderErrorCode>([
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_UNKNOWN',
  'PROVIDER_KEY_MISSING',
  'INVALID_SYMBOL',
  'SYMBOL_NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'MALFORMED_RESPONSE',
]);

export function isProviderErrorCode(code: unknown): code is ProviderErrorCode {
  return typeof code === 'string' && PROVIDER_ERROR_CODES.has(code);
}
