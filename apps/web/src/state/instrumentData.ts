/**
 * One price series per instrument, for the financial-astrology studies.
 *
 * Separate from the shared Research/Gann series because a vedha comparison
 * reads NIFTY, gold and silver side by side. Each dataset records what a
 * repeat run needs to prove it used the same data: where it came from, the
 * columns read, rows kept and rejected, coverage, and a fingerprint (SHA-256
 * of every date and close) that a saved study stores and checks on reopening.
 *
 * Prices stay in memory. Only the descriptors are written to storage, for the
 * same reason as the shared series: storing someone's market data is their
 * choice, not a side effect.
 */
import { create } from 'zustand';
import { makeSeries, parseMarketCsv, ProviderError, type Bar, type Series } from '@astro/research';
import { apiProvider } from '../lib/prices.js';

const KEY = 'astro.fa.datasets';

export type DatasetOrigin = 'file' | 'provider' | 'research-series';

export interface DatasetDescriptor {
  readonly instrumentId: string;
  readonly origin: DatasetOrigin;
  /** File name, provider name, or the Research series' symbol. */
  readonly sourceLabel: string;
  readonly columns: readonly string[];
  /** The column the close was read from, when the file had several candidates. */
  readonly closeColumn: string | null;
  readonly rows: number;
  readonly rejected: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly hasVolume: boolean;
  /** First 16 hex digits of SHA-256 over "date,close" lines. */
  readonly fingerprint: string;
  readonly importedAt: string;
}

export interface Dataset extends DatasetDescriptor {
  readonly series: Series;
}

/** A fingerprint of the data a study reads: the same dates and closes give the same value. */
export async function fingerprintBars(bars: readonly Bar[]): Promise<string> {
  const text = bars.map((b) => `${b.date},${b.close}`).join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const CLOSE_PREFERENCE = ['close', 'close/last', 'adj close', 'adjclose', 'closeprice', 'price', 'last', 'settle'];
function closeColumnOf(columns: readonly string[]): string | null {
  const lower = columns.map((c) => c.trim().toLowerCase());
  for (const p of CLOSE_PREFERENCE) { const i = lower.indexOf(p); if (i >= 0) return columns[i]!; }
  return null;
}

function readDescriptors(): Record<string, DatasetDescriptor> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, DatasetDescriptor>) : {};
  } catch { return {}; }
}
function writeDescriptors(d: Record<string, DatasetDescriptor>): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked: the descriptor is a convenience */ }
}

async function build(instrumentId: string, origin: DatasetOrigin, sourceLabel: string, bars: readonly Bar[], columns: readonly string[], rejected: number): Promise<Dataset> {
  const series = makeSeries(instrumentId, bars);
  return {
    instrumentId, origin, sourceLabel, columns, closeColumn: closeColumnOf(columns), rows: bars.length, rejected,
    firstDate: series.firstDate, lastDate: series.lastDate, hasVolume: bars.some((b) => b.volume !== undefined && b.volume > 0),
    fingerprint: await fingerprintBars(bars), importedAt: new Date().toISOString(), series,
  };
}

interface State {
  readonly datasets: Readonly<Record<string, Dataset>>;
  /** Descriptors of datasets loaded before a reload, whose prices were not kept. */
  readonly previous: Readonly<Record<string, DatasetDescriptor>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly busy: Readonly<Record<string, boolean>>;
  importCsv(instrumentId: string, fileName: string, text: string, choices?: { dayFirst?: boolean; decimalComma?: boolean }): Promise<void>;
  fetchFromProvider(instrumentId: string, symbol: string): Promise<void>;
  adoptSeries(instrumentId: string, series: Series, label: string): Promise<void>;
  clear(instrumentId: string): void;
}

export const useInstrumentData = create<State>((set, get) => {
  const put = (d: Dataset): void => {
    const { series: _s, ...descriptor } = d;
    const all = { ...readDescriptors(), [d.instrumentId]: descriptor };
    writeDescriptors(all);
    const { [d.instrumentId]: _e, ...errors } = get().errors;
    set({ datasets: { ...get().datasets, [d.instrumentId]: d }, errors });
  };
  const fail = (id: string, code: string): void => set({ errors: { ...get().errors, [id]: code } });
  const busy = (id: string, on: boolean): void => set({ busy: { ...get().busy, [id]: on } });
  return {
    datasets: {},
    previous: readDescriptors(),
    errors: {},
    busy: {},
    async importCsv(instrumentId, fileName, text, choices = {}) {
      busy(instrumentId, true);
      try {
        const parsed = parseMarketCsv(text, choices);
        if (parsed.bars.length === 0) { fail(instrumentId, 'NO_ROWS'); return; }
        put(await build(instrumentId, 'file', fileName, parsed.bars, parsed.columns, parsed.rejected.length));
      } catch (cause) {
        fail(instrumentId, (cause as { code?: string }).code ?? 'unknown');
      } finally { busy(instrumentId, false); }
    },
    async fetchFromProvider(instrumentId, symbol) {
      busy(instrumentId, true);
      try {
        const fetched = await apiProvider.fetchDaily(symbol);
        if (fetched.bars.length === 0) { fail(instrumentId, 'NO_ROWS'); return; }
        put(await build(instrumentId, 'provider', fetched.providerName ?? apiProvider.describe.name, fetched.bars, ['date', 'close'], 0));
      } catch (cause) {
        fail(instrumentId, cause instanceof ProviderError ? cause.code : 'unknown');
      } finally { busy(instrumentId, false); }
    },
    async adoptSeries(instrumentId, series, label) {
      put(await build(instrumentId, 'research-series', label, series.bars, ['date', 'close'], 0));
    },
    clear(instrumentId) {
      const { [instrumentId]: _d, ...datasets } = get().datasets;
      const { [instrumentId]: _p, ...rest } = readDescriptors();
      writeDescriptors(rest);
      set({ datasets, previous: rest });
    },
  };
});
