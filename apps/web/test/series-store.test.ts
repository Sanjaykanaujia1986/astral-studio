/**
 * What a price series does across a reload.
 *
 * ## The asymmetry this file pins down
 *
 * The chart comes back by itself, because what is stored is the birth data
 * the reader typed — a few dozen bytes of their own input. A price series'
 * input IS the market data, so bringing it back means storing that, which is
 * a different act and gets an explicit choice rather than a default.
 *
 * Two properties therefore matter more than any wording:
 *
 * 1. With the default settings, nothing resembling price data is written.
 *    If that ever stops being true the product has started keeping market
 *    data nobody asked it to keep.
 * 2. The descriptor IS written either way, so a returning reader is told
 *    which series was open instead of meeting the same blank import box they
 *    saw on their first visit — the amnesia that made a reload look like a
 *    failed import.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSeriesStore } from '../src/state/series.js';

const DESCRIPTOR_KEY = 'astro.series.descriptor';
const BARS_KEY = 'astro.series.bars';
const REMEMBER_KEY = 'astro.series.remember';

const CSV = [
  'Date,Close',
  '2024-01-01,100',
  '2024-01-02,105',
  '2024-01-03,99',
].join('\n');

function freshStore(): void {
  useSeriesStore.setState({
    series: null, rejected: 0, fileName: null, source: null, providerName: null,
    busy: false, errorCode: null, descriptor: null, hydrating: false,
    remember: false, tooLargeToRemember: false,
    choices: { dayFirst: false, decimalComma: false },
  });
}

beforeEach(() => {
  localStorage.clear();
  freshStore();
});

describe('by default, prices stay out of browser storage', () => {
  it('writes a descriptor but no bars', () => {
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    expect(useSeriesStore.getState().series?.bars).toHaveLength(3);

    expect(localStorage.getItem(BARS_KEY)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(DESCRIPTOR_KEY)!) as Record<string, unknown>;
    expect(stored).toMatchObject({
      symbol: 'ACME', bars: 3, firstDate: '2024-01-01', lastDate: '2024-01-03', source: 'file',
    });
  });

  it('writes no price anywhere in storage', () => {
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    /*
     * The blunt version of the assertion above, and the one worth keeping:
     * whatever shape a future change gives the descriptor, a closing price
     * must not appear in it.
     */
    const everything = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k) ?? '')
      .join('|');
    expect(everything).not.toContain('105');
    expect(everything).not.toContain('99');
  });

  it('names the series that was open after a reload, without its prices', () => {
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    freshStore();
    useSeriesStore.setState({ descriptor: null, hydrating: true });

    // What a reload does: storage survives, memory does not.
    useSeriesStore.getState().restore();
    const state = useSeriesStore.getState();

    expect(state.series).toBeNull();
    expect(state.hydrating).toBe(false);
    expect(state.descriptor?.symbol).toBe('ACME');
    expect(state.descriptor?.bars).toBe(3);
  });

  it('brings back the parse choices, so re-importing is one click', () => {
    useSeriesStore.getState().setChoices({ dayFirst: true, decimalComma: true });
    useSeriesStore.getState().importCsv('ACME.csv', CSV);

    const descriptor = JSON.parse(localStorage.getItem(DESCRIPTOR_KEY)!) as
      { choices: { dayFirst: boolean; decimalComma: boolean } };
    expect(descriptor.choices).toEqual({ dayFirst: true, decimalComma: true });
  });
});

describe('when the reader asks for the series to be kept', () => {
  beforeEach(() => {
    useSeriesStore.getState().setRemember(true);
  });

  it('stores the bars and reads them back', () => {
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    expect(localStorage.getItem(BARS_KEY)).not.toBeNull();

    freshStore();
    useSeriesStore.setState({ remember: true, hydrating: true });
    useSeriesStore.getState().restore();

    const state = useSeriesStore.getState();
    expect(state.hydrating).toBe(false);
    expect(state.series?.symbol).toBe('ACME');
    expect(state.series?.bars.map((b) => b.close)).toEqual([100, 105, 99]);
  });

  it('records the choice itself, so it outlives the tab', () => {
    expect(JSON.parse(localStorage.getItem(REMEMBER_KEY)!)).toBe(true);
  });

  it('deletes what was stored the moment it is switched off', () => {
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    expect(localStorage.getItem(BARS_KEY)).not.toBeNull();

    useSeriesStore.getState().setRemember(false);
    // An opt-out that leaves the data behind is not an opt-out.
    expect(localStorage.getItem(BARS_KEY)).toBeNull();
    // The series stays loaded; only the copy on disk goes.
    expect(useSeriesStore.getState().series?.bars).toHaveLength(3);
  });

  it('stores a series that was already open when the box is ticked', () => {
    useSeriesStore.getState().setRemember(false);
    useSeriesStore.getState().importCsv('ACME.csv', CSV);
    expect(localStorage.getItem(BARS_KEY)).toBeNull();

    useSeriesStore.getState().setRemember(true);
    expect(localStorage.getItem(BARS_KEY)).not.toBeNull();
  });

  it('says so rather than silently dropping a series too large to store', () => {
    // Over the 4 MB cap: 120k daily bars, three and a quarter centuries.
    const rows = ['Date,Close'];
    for (let i = 0; i < 120_000; i += 1) {
      const day = new Date(Date.UTC(1800, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      rows.push(day + ',' + (100 + (i % 500)).toFixed(4));
    }
    useSeriesStore.getState().importCsv('HUGE.csv', rows.join('\n'));

    expect(useSeriesStore.getState().tooLargeToRemember).toBe(true);
    expect(localStorage.getItem(BARS_KEY)).toBeNull();
    // Still usable; only the storing failed.
    expect(useSeriesStore.getState().series?.bars.length).toBe(120_000);
    // And the descriptor is written regardless, because it is tiny.
    expect(localStorage.getItem(DESCRIPTOR_KEY)).not.toBeNull();
  });
});

describe('storage that cannot be trusted', () => {
  const junk: readonly (readonly [string, string])[] = [
    ['not JSON', '{oh no'],
    ['an empty list', '[]'],
    ['bars with no close', '[{"date":"2024-01-01"}]'],
    ['a close that is a string', '[{"date":"2024-01-01","close":"100"}]'],
  ];

  for (const [name, raw] of junk) {
    it('ignores ' + name + ' and keeps the descriptor', () => {
      useSeriesStore.getState().setRemember(true);
      useSeriesStore.getState().importCsv('ACME.csv', CSV);
      localStorage.setItem(BARS_KEY, raw);

      freshStore();
      useSeriesStore.setState({ remember: true, hydrating: true });
      useSeriesStore.getState().restore();

      const state = useSeriesStore.getState();
      expect(state.series).toBeNull();
      expect(state.hydrating).toBe(false);
      // The descriptor is separate and still good, so the reader is still
      // told which series was open.
      expect(state.descriptor?.symbol).toBe('ACME');
      expect(localStorage.getItem(BARS_KEY)).toBeNull();
    });
  }

  it('drops a malformed descriptor rather than rendering "undefined bars"', () => {
    localStorage.setItem(DESCRIPTOR_KEY, '{"bars":3,"source":"file"}');
    freshStore();
    useSeriesStore.setState({ hydrating: true });
    useSeriesStore.getState().restore();
    expect(useSeriesStore.getState().descriptor).toBeNull();
  });
});

describe('clearing', () => {
  it('removes the prices and the descriptor together', () => {
    useSeriesStore.getState().setRemember(true);
    useSeriesStore.getState().importCsv('ACME.csv', CSV);

    useSeriesStore.getState().clear();

    expect(localStorage.getItem(BARS_KEY)).toBeNull();
    // Or the workspaces would keep naming a series just dismissed.
    expect(localStorage.getItem(DESCRIPTOR_KEY)).toBeNull();
    expect(useSeriesStore.getState().descriptor).toBeNull();
  });
});
