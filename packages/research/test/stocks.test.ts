/**
 * NSE stocks as instruments (0.46). Symbols and dates are synthetic.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  instrumentById, listInstruments, registerNseStocks, registeredNseStocks, nseStockId, nseSymbolOf, builtInForNseSymbol,
  nseListingRecord, chartRecordsFor, allChartRecords, validateRecord, setAsideBeforeListing, INSTRUMENTS, CHART_RECORDS, NSE_CALENDAR,
} from '../src/index.js';

afterEach(() => registerNseStocks([]));

describe('NSE stock instruments', () => {
  it('names the Yahoo .NS symbol, the NSE calendar and rupees, and keeps & and -', () => {
    registerNseStocks([{ symbol: 'B&S', name: 'Beta & Sons Ltd.' }, { symbol: 'GAMMA-D', name: 'Gamma-Delta Ltd.' }]);
    const b = instrumentById(nseStockId('B&S'))!;
    expect(b).toMatchObject({ id: 'nse:B&S', name: 'Beta & Sons Ltd.', exchange: 'NSE', symbol: 'B&S.NS', currency: 'INR', priceBasis: 'equity-as-provided', hasVolume: true });
    expect(b.calendar).toBe(NSE_CALENDAR);
    expect(listInstruments().map((i) => i.id)).toEqual([...INSTRUMENTS.map((i) => i.id), 'nse:B&S', 'nse:GAMMA-D']);
  });
  it('still resolves a stock that was removed, by its symbol, so a saved study keeps its name', () => {
    expect(instrumentById('nse:ALPHA')).toMatchObject({ name: 'ALPHA', symbol: 'ALPHA.NS' });
    expect(instrumentById('nse:bad symbol')).toBeUndefined();
    expect(instrumentById('nse:')).toBeUndefined();
    expect(nseSymbolOf('nifty50')).toBeNull();
  });
  it('never adds a built-in twice, and skips malformed symbols', () => {
    expect(builtInForNseSymbol('RELIANCE')?.id).toBe('reliance');
    expect(builtInForNseSymbol('GOLDBEES')?.id).toBe('goldbees');
    registerNseStocks([{ symbol: 'RELIANCE', name: 'Reliance' }, { symbol: 'lower', name: 'x' }, { symbol: 'A/B', name: 'x' }, { symbol: 'ALPHA', name: 'Alpha' }]);
    expect(registeredNseStocks().map((s) => s.symbol)).toEqual(['ALPHA']);
  });
});

describe('NSE listing records', () => {
  it('is a valid date-only Mumbai record with its source, and none without a date', () => {
    const r = nseListingRecord({ symbol: 'ALPHA', name: 'Alpha', listed: '2008-10-06', readOn: '2026-11-27' })!;
    expect(r).toMatchObject({ id: 'nse-ALPHA-listing', instrumentId: 'nse:ALPHA', kind: 'listing', date: '2008-10-06', timeCertainty: 'date-only', timeZone: 'Asia/Kolkata' });
    expect(r.time).toBeUndefined();
    expect(r.source).toContain('EQUITY_L.csv');
    expect(r.source).toContain('read 2026-11-27');
    expect(validateRecord(r)).toEqual([]);
    expect(nseListingRecord({ symbol: 'TRUSTU', name: 'Trust' })).toBeNull();
    expect(nseListingRecord({ symbol: 'X', name: 'X', listed: '06-OCT-2008' })).toBeNull();
  });
  it('says an NSE listing before 2000 is likely not the first listing', () => {
    expect(nseListingRecord({ symbol: 'OLD', name: 'Old', listed: '1995-02-08' })!.note).toContain('not its first listing');
    expect(nseListingRecord({ symbol: 'OLD2', name: 'Old', listed: '1996-01-03' })!.note).toContain('not its first listing');
    expect(nseListingRecord({ symbol: 'NEW', name: 'New', listed: '2004-08-25' })!.note).not.toContain('not its first listing');
  });
  it('joins the added stocks’ listings to the built-in and own records', () => {
    registerNseStocks([{ symbol: 'ALPHA', name: 'Alpha', listed: '2008-10-06' }, { symbol: 'TRUSTU', name: 'Trust' }]);
    const own = { ...nseListingRecord({ symbol: 'ALPHA', name: 'Alpha', listed: '2008-10-06' })!, id: 'own-alpha', kind: 'ipo' as const, source: 'my prospectus' };
    expect(allChartRecords([own]).length).toBe(CHART_RECORDS.length + 2);
    expect(chartRecordsFor('nse:ALPHA', [own]).map((r) => r.id)).toEqual(['nse-ALPHA-listing', 'own-alpha']);
    expect(chartRecordsFor('nse:TRUSTU')).toEqual([]);
  });
});

describe('bars before a listing', () => {
  const bar = (date: string, close: number) => ({ date, open: close, high: close, low: close, close });
  it('sets aside every bar dated before the listing day and keeps the listing day itself', () => {
    const bars = [bar('2002-08-12', 39), bar('2004-08-24', 115), bar('2004-08-25', 123), bar('2004-08-26', 120)];
    const r = setAsideBeforeListing(bars, '2004-08-25');
    expect(r.bars.map((b) => b.date)).toEqual(['2004-08-25', '2004-08-26']);
    expect(r.before).toEqual({ listedOn: '2004-08-25', count: 2, first: '2002-08-12', last: '2004-08-24' });
  });
  it('changes nothing without a listing day or when the data starts after it', () => {
    const bars = [bar('2010-01-04', 1)];
    expect(setAsideBeforeListing(bars, undefined)).toEqual({ bars, before: null });
    expect(setAsideBeforeListing(bars, '2004-08-25')).toEqual({ bars, before: null });
  });
  it('an added stock carries its NSE listing day; a built-in does not', () => {
    registerNseStocks([{ symbol: 'ALPHA', name: 'Alpha', listed: '2004-08-25' }]);
    expect(instrumentById('nse:ALPHA')!.listedOn).toBe('2004-08-25');
    expect(instrumentById('reliance')!.listedOn).toBeUndefined();
  });
});
