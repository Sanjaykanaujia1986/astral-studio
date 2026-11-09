/**
 * The imported price series, shared between Research and Gann Lab.
 *
 * Both workspaces work on the same file, and asking for it twice would be the
 * kind of small indignity that makes a product feel unfinished — worse, two
 * copies could drift if one was re-imported with different parse options and
 * the other was not.
 *
 * Like the chart store, this keeps what the series was built FROM alongside
 * the result: the file name, the parse options and how many rows were
 * rejected. A series whose rejected count is invisible invites the reader to
 * assume the import was clean.
 *
 * ## What survives a reload, and why it is not the same answer as the chart
 *
 * The chart comes back after a reload because what is stored is its INPUT:
 * a few dozen bytes of birth data the reader typed. A series' input is the
 * market data itself, so storing it is a materially different act — and
 * quietly keeping someone's market data in browser storage is not something
 * they asked for.
 *
 * So this store does two things instead of one:
 *
 * 1. **The descriptor is always kept.** Symbol, bar count, date range, where
 *    it came from, and the parse choices — metadata, not prices. After a
 *    reload the workspaces can say *which* series was open and that the data
 *    itself was not kept, rather than greeting a returning reader with the
 *    same blank "import a CSV" they saw on their first visit. That amnesia
 *    was the actual defect; it looked like the import had failed.
 * 2. **The bars are kept only if the reader says so.** An explicit opt-in,
 *    off by default, so the choice to store market data is theirs and is
 *    made in words rather than inferred from the fact that they used the
 *    feature.
 *
 * The parse choices come back either way, so a re-import is one click with
 * the same settings rather than a second guess at the date order.
 */
import { create } from 'zustand';
import {
  makeSeries, parseMarketCsv, CsvImportError, ProviderError,
  type Bar, type MarketDataProvider, type Series,
} from '@astro/research';

const DESCRIPTOR_KEY = 'astro.series.descriptor';
const REMEMBER_KEY = 'astro.series.remember';
const BARS_KEY = 'astro.series.bars';

/**
 * Bars are capped before they are written.
 *
 * localStorage throws a QuotaExceededError somewhere near 5 MB and the throw
 * arrives on an unrelated write, so a decade of intraday data would break
 * saving an alert rather than failing where it was caused. 4 MB of JSON is
 * roughly fifty thousand daily bars — two centuries.
 */
const MAX_BARS_BYTES = 4_000_000;

export interface ParseChoices {
  readonly dayFirst: boolean;
  readonly decimalComma: boolean;
}

/**
 * What was loaded, without the prices.
 *
 * Kept across a reload so the workspaces can name the series that was open.
 * Deliberately carries no bar data: that is the whole point of the split.
 */
export interface SeriesDescriptor {
  readonly symbol: string;
  readonly bars: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly source: 'file' | 'provider';
  readonly fileName: string | null;
  readonly providerName: string | null;
  readonly choices: ParseChoices;
}

interface SeriesState {
  readonly series: Series | null;
  /** The last series that was open, prices excluded. Survives a reload. */
  readonly descriptor: SeriesDescriptor | null;
  /** True while a remembered series is being read back, before the first paint settles. */
  readonly hydrating: boolean;
  /** Whether the reader has asked for the bars themselves to be stored. */
  readonly remember: boolean;
  /** True when remembering was asked for and the series was too big to store. */
  readonly tooLargeToRemember: boolean;
  setRemember: (remember: boolean) => void;
  /** Read back a remembered series. Safe to call more than once. */
  restore: () => void;
  /** Rows the parser could not use. Shown, never swallowed. */
  readonly rejected: number;
  readonly fileName: string | null;
  /** Where the current series came from. */
  readonly source: 'file' | 'provider' | null;
  readonly providerName: string | null;
  readonly busy: boolean;
  readonly choices: ParseChoices;
  /** Engine-style CODE, so the catalogue keeps ownership of the wording. */
  readonly errorCode: string | null;
  setChoices: (choices: Partial<ParseChoices>) => void;
  importCsv: (fileName: string, text: string) => void;
  /**
   * Fetch a symbol through a provider.
   *
   * Sets `source` so the reader — and a later study — can tell a fetched
   * series from an imported file. A series whose origin is unrecorded cannot
   * be reproduced.
   */
  fetchSymbol: (provider: MarketDataProvider, symbol: string) => Promise<void>;
  clear: () => void;
}

const DEFAULT_CHOICES: ParseChoices = { dayFirst: false, decimalComma: false };

function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private mode, blocked storage, or a quota that a large series filled.
    return false;
  }
}

function drop(key: string): void {
  try { globalThis.localStorage?.removeItem(key); } catch { /* already gone */ }
}

/**
 * The stored descriptor, or null.
 *
 * Validated rather than trusted, like the alerts and the Gann templates. A
 * descriptor missing `symbol` would render "undefined, 745 bars" into a
 * sentence the reader is meant to rely on.
 */
function loadDescriptor(): SeriesDescriptor | null {
  const d = readJson<Partial<SeriesDescriptor>>(DESCRIPTOR_KEY);
  if (!d) return null;
  if (typeof d.symbol !== 'string' || typeof d.bars !== 'number' || !Number.isFinite(d.bars)) {
    return null;
  }
  if (typeof d.firstDate !== 'string' || typeof d.lastDate !== 'string') return null;
  if (d.source !== 'file' && d.source !== 'provider') return null;
  return {
    symbol: d.symbol,
    bars: d.bars,
    firstDate: d.firstDate,
    lastDate: d.lastDate,
    source: d.source,
    fileName: typeof d.fileName === 'string' ? d.fileName : null,
    providerName: typeof d.providerName === 'string' ? d.providerName : null,
    choices: {
      dayFirst: d.choices?.dayFirst === true,
      decimalComma: d.choices?.decimalComma === true,
    },
  };
}

/** The remembered bars, checked hard enough that nothing malformed reaches a study. */
function loadBars(): readonly Bar[] | null {
  const bars = readJson<unknown>(BARS_KEY);
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const ok = bars.every((b) => typeof b === 'object' && b !== null
    && typeof (b as Bar).date === 'string'
    && typeof (b as Bar).close === 'number'
    && Number.isFinite((b as Bar).close));
  return ok ? (bars as Bar[]) : null;
}

function describe(
  series: Series,
  source: 'file' | 'provider',
  fileName: string | null,
  providerName: string | null,
  choices: ParseChoices,
): SeriesDescriptor {
  return {
    symbol: series.symbol,
    bars: series.bars.length,
    firstDate: series.firstDate,
    lastDate: series.lastDate,
    source,
    fileName,
    providerName,
    choices,
  };
}

/**
 * Write the descriptor always; the bars only on request.
 *
 * Returns false when the reader asked for the bars and they would not fit, so
 * the panel can say so rather than leaving them believing it was stored.
 */
function persist(descriptor: SeriesDescriptor, bars: readonly Bar[], remember: boolean): boolean {
  writeJson(DESCRIPTOR_KEY, descriptor);
  if (!remember) {
    drop(BARS_KEY);
    return true;
  }
  const encoded = JSON.stringify(bars);
  if (encoded.length > MAX_BARS_BYTES) {
    drop(BARS_KEY);
    return false;
  }
  return writeJson(BARS_KEY, bars);
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  series: null,
  rejected: 0,
  fileName: null,
  source: null,
  providerName: null,
  busy: false,
  // The parse choices come back whether or not the bars did, so a re-import
  // is one click rather than a second guess at the date order.
  choices: loadDescriptor()?.choices ?? DEFAULT_CHOICES,
  errorCode: null,
  descriptor: loadDescriptor(),
  remember: readJson<boolean>(REMEMBER_KEY) === true,
  // Resolved before the first paint, so a panel knows on its first render
  // whether bars are on the way.
  hydrating: readJson<boolean>(REMEMBER_KEY) === true && loadDescriptor() !== null,
  tooLargeToRemember: false,

  setChoices(choices) {
    set({ choices: { ...get().choices, ...choices } });
  },

  setRemember(remember) {
    set({ remember });
    writeJson(REMEMBER_KEY, remember);
    const { series, source, fileName, providerName, choices } = get();
    if (!remember) {
      // Turning it off deletes what was stored. An opt-out that leaves the
      // data behind is not an opt-out.
      drop(BARS_KEY);
      set({ tooLargeToRemember: false });
      return;
    }
    if (!series || !source) return;
    const stored = persist(
      describe(series, source, fileName, providerName, choices), series.bars, true,
    );
    set({ tooLargeToRemember: !stored });
  },

  restore() {
    const descriptor = loadDescriptor();
    /*
     * Set on every path, including the failing ones. The descriptor is what
     * lets a workspace name the series that was open, and it is independent
     * of whether the bars came back — that independence is the whole design.
     */
    set({ descriptor, choices: descriptor?.choices ?? DEFAULT_CHOICES });
    if (!descriptor || !get().remember) {
      set({ hydrating: false });
      return;
    }
    const bars = loadBars();
    if (!bars) {
      // The descriptor still stands — the workspaces can say what was open.
      drop(BARS_KEY);
      set({ hydrating: false });
      return;
    }
    try {
      set({
        series: makeSeries(descriptor.symbol, bars),
        rejected: 0,
        fileName: descriptor.fileName,
        source: descriptor.source,
        providerName: descriptor.providerName,
        errorCode: null,
      });
    } catch (cause) {
      console.error('remembered series could not be restored', cause);
      drop(BARS_KEY);
    } finally {
      set({ hydrating: false });
    }
  },

  importCsv(fileName, text) {
    const { choices } = get();
    try {
      const parsed = parseMarketCsv(text, choices);
      // The file name is the only symbol available; nothing is fetched.
      const series = makeSeries(fileName.replace(/\.csv$/i, ''), parsed.bars);
      const descriptor = describe(series, 'file', fileName, null, choices);
      const stored = persist(descriptor, series.bars, get().remember);
      set({
        series,
        rejected: parsed.rejected.length,
        fileName,
        source: 'file',
        providerName: null,
        errorCode: null,
        descriptor,
        tooLargeToRemember: get().remember && !stored,
      });
    } catch (cause) {
      set({
        series: null,
        rejected: 0,
        fileName,
        errorCode: (cause as CsvImportError | null)?.code ?? 'unknown',
      });
    }
  },

  async fetchSymbol(provider, symbol) {
    const trimmed = symbol.trim();
    if (!trimmed) return;
    set({ busy: true, errorCode: null });
    try {
      const fetched = await provider.fetchDaily(trimmed);
      const series = makeSeries(trimmed.toUpperCase(), fetched.bars);
      // The name the SERVER reported, falling back to the adapter's own.
      const name = fetched.providerName ?? provider.describe.name;
      const descriptor = describe(series, 'provider', null, name, get().choices);
      const stored = persist(descriptor, series.bars, get().remember);
      set({
        series,
        rejected: 0,
        fileName: null,
        source: 'provider',
        providerName: name,
        errorCode: null,
        descriptor,
        tooLargeToRemember: get().remember && !stored,
      });
    } catch (cause) {
      set({
        series: null,
        rejected: 0,
        source: null,
        providerName: provider.describe.name,
        errorCode: cause instanceof ProviderError ? cause.code : 'unknown',
      });
    } finally {
      set({ busy: false });
    }
  },

  clear() {
    set({
      series: null, rejected: 0, fileName: null,
      source: null, providerName: null, errorCode: null,
      descriptor: null, hydrating: false, tooLargeToRemember: false,
    });
    // Clearing means clearing. The descriptor goes too, or the workspaces
    // would keep naming a series the reader has just dismissed.
    drop(DESCRIPTOR_KEY);
    drop(BARS_KEY);
  },
}));

/** Index of the lowest and highest close, for anchoring a fan to a real pivot. */
export function extremeBars(bars: readonly Bar[]): {
  readonly lowIndex: number;
  readonly highIndex: number;
} {
  let lowIndex = 0;
  let highIndex = 0;
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i]!.close < bars[lowIndex]!.close) lowIndex = i;
    if (bars[i]!.close > bars[highIndex]!.close) highIndex = i;
  }
  return { lowIndex, highIndex };
}
