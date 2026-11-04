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
 * Nothing is persisted. The file came from the reader's disk; re-reading it on
 * demand is honest, and quietly keeping market data in browser storage is not
 * something they asked for.
 */
import { create } from 'zustand';
import { makeSeries, parseMarketCsv, CsvImportError, type Bar, type Series } from '@astro/research';

export interface ParseChoices {
  readonly dayFirst: boolean;
  readonly decimalComma: boolean;
}

interface SeriesState {
  readonly series: Series | null;
  /** Rows the parser could not use. Shown, never swallowed. */
  readonly rejected: number;
  readonly fileName: string | null;
  readonly choices: ParseChoices;
  /** Engine-style CODE, so the catalogue keeps ownership of the wording. */
  readonly errorCode: string | null;
  setChoices: (choices: Partial<ParseChoices>) => void;
  importCsv: (fileName: string, text: string) => void;
  clear: () => void;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  series: null,
  rejected: 0,
  fileName: null,
  choices: { dayFirst: false, decimalComma: false },
  errorCode: null,

  setChoices(choices) {
    set({ choices: { ...get().choices, ...choices } });
  },

  importCsv(fileName, text) {
    const { choices } = get();
    try {
      const parsed = parseMarketCsv(text, choices);
      set({
        // The file name is the only symbol available; nothing is fetched.
        series: makeSeries(fileName.replace(/\.csv$/i, ''), parsed.bars),
        rejected: parsed.rejected.length,
        fileName,
        errorCode: null,
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

  clear() {
    set({ series: null, rejected: 0, fileName: null, errorCode: null });
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
