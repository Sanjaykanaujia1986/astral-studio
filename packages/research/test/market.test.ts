/**
 * CSV import and return series.
 *
 * The fixtures here are synthetic and obviously so. No market data ships with
 * this project, and a test that quietly embedded some would be both a licensing
 * problem and a lie about where the numbers came from.
 */
import { describe, it, expect } from 'vitest';
import {
  parseMarketCsv,
  splitCsvLine,
  detectDelimiter,
  parseDateCell,
  parseNumberCell,
  CsvImportError,
} from '../src/market/csv.js';
import {
  makeSeries,
  logReturns,
  profileSeries,
  inferPeriodsPerYear,
  daysBetween,
  toSimpleReturn,
} from '../src/market/series.js';

describe('splitCsvLine', () => {
  it('honours quoted fields containing the delimiter', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(splitCsvLine('a,"say ""hi""",c', ',')).toEqual(['a', 'say "hi"', 'c']);
  });

  it('keeps empty trailing fields', () => {
    expect(splitCsvLine('a,b,', ',')).toEqual(['a', 'b', '']);
  });
});

describe('detectDelimiter', () => {
  it('finds the delimiter that splits the header into the most fields', () => {
    expect(detectDelimiter('Date,Open,High,Low,Close')).toBe(',');
    expect(detectDelimiter('Date;Open;High;Low;Close')).toBe(';');
    expect(detectDelimiter('Date\tOpen\tHigh\tClose')).toBe('\t');
  });
});

describe('parseDateCell', () => {
  it('accepts ISO dates with or without a time', () => {
    expect(parseDateCell('2024-03-15', false)).toBe('2024-03-15');
    expect(parseDateCell('2024-03-15T00:00:00Z', false)).toBe('2024-03-15');
    expect(parseDateCell('2024-03-15 09:30', false)).toBe('2024-03-15');
  });

  it('resolves the slash ambiguity from the caller, not by guessing', () => {
    /*
     * 03/04/2024 is 3 April in London and 4 March in New York. Guessing would
     * shift events by up to eleven days and nothing downstream would notice, so
     * the caller states the convention.
     */
    expect(parseDateCell('03/04/2024', true)).toBe('2024-04-03');
    expect(parseDateCell('03/04/2024', false)).toBe('2024-03-04');
  });

  it('rejects dates that do not exist', () => {
    // Date.UTC would happily roll 31 February into 2 March.
    expect(parseDateCell('2024-02-31', false)).toBeUndefined();
    expect(parseDateCell('2023-02-29', false)).toBeUndefined();
    // 2024 is a leap year, so this one is real.
    expect(parseDateCell('2024-02-29', false)).toBe('2024-02-29');
  });

  it('rejects anything it does not recognise', () => {
    expect(parseDateCell('15 March 2024', false)).toBeUndefined();
    expect(parseDateCell('', false)).toBeUndefined();
  });
});

describe('parseNumberCell', () => {
  it('strips currency symbols and thousands separators', () => {
    expect(parseNumberCell('$1,234.56', false)).toBeCloseTo(1234.56, 10);
    expect(parseNumberCell('£99', false)).toBe(99);
    expect(parseNumberCell('₹1,00,000', false)).toBe(100000);
  });

  it('handles the comma decimal convention', () => {
    expect(parseNumberCell('1.234,56', true)).toBeCloseTo(1234.56, 10);
    expect(parseNumberCell('12,5', true)).toBeCloseTo(12.5, 10);
  });

  it('returns undefined rather than zero for an empty or null cell', () => {
    // Number('') is 0, and a zero price becomes a −100% return three layers
    // later with nothing to indicate where it came from.
    expect(parseNumberCell('', false)).toBeUndefined();
    expect(parseNumberCell('N/A', false)).toBeUndefined();
    expect(parseNumberCell('null', false)).toBeUndefined();
    expect(parseNumberCell('-', false)).toBeUndefined();
  });
});

describe('parseMarketCsv', () => {
  const GOOD = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-02,100,102,99,101,1000',
    '2024-01-03,101,103,100,102.5,1100',
    '2024-01-04,102.5,104,101,103,900',
  ].join('\n');

  it('reads a well-formed file', () => {
    const parsed = parseMarketCsv(GOOD);
    expect(parsed.bars).toHaveLength(3);
    expect(parsed.bars[0]).toEqual({
      date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1000,
    });
    expect(parsed.rejected).toEqual([]);
  });

  it('accepts a file with only a date and a close', () => {
    const parsed = parseMarketCsv('date,close\n2024-01-02,101\n2024-01-03,102');
    expect(parsed.bars).toHaveLength(2);
    expect(parsed.bars[0]!.open).toBeUndefined();
  });

  it('recognises common header spellings', () => {
    const parsed = parseMarketCsv('Timestamp,Adj Close\n2024-01-02,101\n2024-01-03,102');
    expect(parsed.bars).toHaveLength(2);
  });

  it('sorts ascending regardless of the file order', () => {
    const parsed = parseMarketCsv('date,close\n2024-01-04,103\n2024-01-02,101\n2024-01-03,102');
    expect(parsed.bars.map((b) => b.date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
  });

  it('reports unusable rows instead of dropping them silently', () => {
    /*
     * The count of rejected rows is the point. A reader who is told 340 of
     * 5,000 rows were unusable can decide whether to trust the result; a reader
     * shown a clean-looking chart built from the surviving 4,660 cannot.
     */
    const parsed = parseMarketCsv([
      'date,close',
      '2024-01-02,101',
      'not-a-date,102',
      '2024-01-03,',
      '2024-01-04,0',
      '2024-01-02,999',
      '2024-01-05,105',
    ].join('\n'));

    expect(parsed.bars).toHaveLength(2);
    expect(parsed.rejected.map((r) => r.reason)).toEqual([
      'BAD_DATE', 'BAD_NUMBER', 'BAD_NUMBER', 'DUPLICATE_DATE',
    ]);
    // Line numbers are 1-based including the header, so they match an editor.
    expect(parsed.rejected[0]!.line).toBe(3);
  });

  it('rejects a non-positive close, which has no logarithm', () => {
    const parsed = parseMarketCsv('date,close\n2024-01-02,101\n2024-01-03,-5\n2024-01-04,103');
    expect(parsed.bars).toHaveLength(2);
    expect(parsed.rejected[0]!.reason).toBe('BAD_NUMBER');
  });

  it('never interpolates a missing bar', () => {
    // A gap is a fact about the data. Filling it would corrupt every statistic
    // downstream while making the input look cleaner than it is.
    const parsed = parseMarketCsv('date,close\n2024-01-02,101\n2024-01-09,110');
    expect(parsed.bars).toHaveLength(2);
    expect(parsed.bars[1]!.date).toBe('2024-01-09');
  });

  it('fails loudly on files it cannot use at all', () => {
    expect(() => parseMarketCsv('')).toThrow(CsvImportError);
    expect(() => parseMarketCsv('one-column\nvalue')).toThrow(/header/);
    expect(() => parseMarketCsv('name,price\nfoo,1')).toThrow(/date column/);
    expect(() => parseMarketCsv('date,name\n2024-01-02,foo')).toThrow(/closing price/);
    expect(() => parseMarketCsv('date,close\nbad,bad')).toThrow(/usable rows/);
  });

  it('carries an error code, not only a message', () => {
    try {
      parseMarketCsv('');
      expect.unreachable();
    } catch (error) {
      expect((error as CsvImportError).code).toBe('EMPTY_FILE');
    }
  });
});

describe('returns', () => {
  const series = makeSeries('TEST', [
    { date: '2024-01-02', close: 100 },
    { date: '2024-01-03', close: 110 },
    { date: '2024-01-08', close: 99 },
  ]);

  it('computes log returns between consecutive bars', () => {
    const returns = logReturns(series);
    expect(returns).toHaveLength(2);
    expect(returns[0]!.logReturn).toBeCloseTo(Math.log(1.1), 12);
    expect(returns[0]!.date).toBe('2024-01-03');
  });

  it('carries the calendar gap, so a weekend is not mistaken for a day', () => {
    const returns = logReturns(series);
    expect(returns[0]!.gapDays).toBe(1);
    expect(returns[1]!.gapDays).toBe(5);
  });

  it('log returns add where simple returns do not', () => {
    // The reason log returns are used at all.
    const returns = logReturns(series);
    const total = returns.reduce((sum, r) => sum + r.logReturn, 0);
    expect(toSimpleReturn(total)).toBeCloseTo(99 / 100 - 1, 12);
  });
});

describe('daysBetween', () => {
  it('counts whole UTC days, across a leap day and a year boundary', () => {
    expect(daysBetween('2024-01-02', '2024-01-03')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2023-12-31', '2024-01-01')).toBe(1);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });
});

describe('profiling a series', () => {
  it('measures the trading calendar rather than assuming one', () => {
    /*
     * Annualising with 252 when the file is weekly overstates a Sharpe ratio by
     * more than a factor of two, and nothing about the numbers themselves would
     * reveal the error.
     */
    const daily = makeSeries('D', buildBars('2020-01-01', 500, 1.4));
    expect(inferPeriodsPerYear(profileSeries(daily)).label).toBe('daily');

    const weekly = makeSeries('W', buildBars('2020-01-01', 200, 7));
    expect(inferPeriodsPerYear(profileSeries(weekly)).label).toBe('weekly');
    expect(inferPeriodsPerYear(profileSeries(weekly)).periodsPerYear).toBe(52);

    const monthly = makeSeries('M', buildBars('2020-01-01', 60, 30.4));
    expect(inferPeriodsPerYear(profileSeries(monthly)).label).toBe('monthly');
  });

  it('reports gaps that a weekend does not explain', () => {
    const series = makeSeries('G', [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 101 },
      { date: '2024-01-20', close: 102 },
    ]);
    const profile = profileSeries(series);
    expect(profile.gapsOverFourDays).toBe(1);
    expect(profile.largestGapDays).toBe(17);
  });

  it('labels an irregular series as irregular rather than forcing a calendar', () => {
    const sparse = makeSeries('X', buildBars('2020-01-01', 30, 20));
    expect(inferPeriodsPerYear(profileSeries(sparse)).label).toBe('irregular');
  });
});

/** Synthetic bars at a fixed spacing. Obviously not market data. */
function buildBars(start: string, count: number, spacingDays: number) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(startMs + Math.round(i * spacingDays) * 86_400_000)
      .toISOString().slice(0, 10),
    close: 100 + i,
  }));
}
