/**
 * Instruments and their charts: what a price series is, and which moments
 * have been proposed as its "birth".
 *
 * ## Provenance before anything else
 *
 * A study is only reproducible if the series is: its exchange or source, the
 * symbol, the currency, what the price is (index level, a share price as the
 * source adjusts it, a futures contract rolled in some way), the time zone and
 * the exchange calendar. Every instrument carries all of that.
 *
 * ## An instrument has more than one chart
 *
 * A company is incorporated, offers shares, lists, first trades; an index is
 * launched on one date with a base date earlier still. Each is a distinct
 * chart record with its own source, place, time zone and how certain its time
 * is. Nothing here picks one as "the" chart.
 *
 * A record whose time is unknown is `date-only`. Anything that depends on the
 * time of day (the ascendant, the houses, a Moon near a nakṣatra boundary) is
 * then reported uncertain or unavailable, never computed from an invented
 * time. When a noon convention is used it is named on every result.
 */
import type { ExchangeCalendar } from './market/calendar.js';
import { NSE_CALENDAR, BSE_CALENDAR, COMEX_CALENDAR } from './market/calendar.js';

export type PriceBasis =
  | 'price-index'
  | 'equity-as-provided'
  | 'futures-continuous'
  | 'etf-units';

export interface Instrument {
  readonly id: string;
  readonly name: string;
  /** Exchange or index provider. */
  readonly exchange: string;
  /** The symbol as the data source names it. */
  readonly symbol: string;
  readonly currency: string;
  readonly priceBasis: PriceBasis;
  /** Plain statement of how prices are adjusted or rolled, as far as it is known. */
  readonly adjustment: string;
  /** False for a price index: there is no traded volume. */
  readonly hasVolume: boolean;
  readonly calendar: ExchangeCalendar;
  /** For futures: the contract and the roll, or that the source does not document it. */
  readonly contract?: string;
}

export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'nifty50', name: 'NIFTY 50', exchange: 'NSE Indices (NSE)', symbol: '^NSEI', currency: 'INR',
    priceBasis: 'price-index', adjustment: 'Price index; dividends not reinvested.', hasVolume: false, calendar: NSE_CALENDAR,
  },
  {
    id: 'sensex', name: 'S&P BSE SENSEX', exchange: 'BSE', symbol: '^BSESN', currency: 'INR',
    priceBasis: 'price-index', adjustment: 'Price index; dividends not reinvested.', hasVolume: false, calendar: BSE_CALENDAR,
  },
  {
    id: 'reliance', name: 'Reliance Industries', exchange: 'NSE', symbol: 'RELIANCE.NS', currency: 'INR',
    priceBasis: 'equity-as-provided',
    adjustment: 'Closes as the data source provides them; record whether they are adjusted for splits and bonuses before comparing across 2017 (1:1 bonus) or 2024 (1:1 bonus).',
    hasVolume: true, calendar: NSE_CALENDAR,
  },
  {
    id: 'gold', name: 'Gold (COMEX futures)', exchange: 'COMEX', symbol: 'GC=F', currency: 'USD',
    priceBasis: 'futures-continuous', adjustment: 'Unadjusted continuous series: no back-adjustment at rolls.',
    hasVolume: true, calendar: COMEX_CALENDAR,
    contract:
      'COMEX GC, 100 troy oz. Continuous front-month as the source builds it. The roll rule is not documented, and the source serves no ' +
      'expired contracts (GCZ24.CMX and others return "not found", checked 2026-11-24), so the roll dates cannot be reconstructed from it: ' +
      'a jump at a roll is part of the series. For a series with no roll use GOLDBEES.',
  },
  {
    id: 'silver', name: 'Silver (COMEX futures)', exchange: 'COMEX', symbol: 'SI=F', currency: 'USD',
    priceBasis: 'futures-continuous', adjustment: 'Unadjusted continuous series: no back-adjustment at rolls.',
    hasVolume: true, calendar: COMEX_CALENDAR,
    contract:
      'COMEX SI, 5,000 troy oz. Continuous front-month as the source builds it; the roll rule is not documented and expired contracts ' +
      'are not served, so roll dates cannot be reconstructed. For a series with no roll use SILVERBEES.',
  },
  {
    id: 'goldbees', name: 'Gold (Nippon India ETF Gold BeES)', exchange: 'NSE', symbol: 'GOLDBEES.NS', currency: 'INR',
    priceBasis: 'etf-units',
    adjustment:
      'Exchange-traded fund units backed by physical gold, priced in rupees: no futures roll and no contract expiry. Tracks the domestic ' +
      'gold price, so it includes the rupee exchange rate and Indian duties, and trails it by the expense ratio. Check for unit splits before comparing across years.',
    hasVolume: true, calendar: NSE_CALENDAR,
  },
  {
    id: 'silverbees', name: 'Silver (Nippon India Silver ETF)', exchange: 'NSE', symbol: 'SILVERBEES.NS', currency: 'INR',
    priceBasis: 'etf-units',
    adjustment:
      'Exchange-traded fund units backed by physical silver, priced in rupees: no futures roll. Listed February 2022, so it cannot cover ' +
      'a 10-15 year study. Includes the rupee exchange rate and Indian duties.',
    hasVolume: true, calendar: NSE_CALENDAR,
  },
];

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

// ------------------------------------------------------------------ chart records

export type ChartKind = 'incorporation' | 'ipo' | 'listing' | 'first-trade' | 'index-launch' | 'index-base-date';

/**
 * How well the time of a chart record is known.
 *
 * - `recorded`: a time from a documented source.
 * - `provisional`: a time adopted for research and labelled so (e.g. an
 *   assumed market opening); results that depend on it are provisional too.
 * - `date-only`: no time; time-sensitive results are uncertain or unavailable.
 */
export type TimeCertainty = 'recorded' | 'provisional' | 'date-only';

export interface ChartRecord {
  readonly id: string;
  readonly instrumentId: string;
  readonly kind: ChartKind;
  /** `YYYY-MM-DD`, local to the place. */
  readonly date: string;
  /** `HH:MM` local; absent when the time is not known. */
  readonly time?: string;
  readonly timeCertainty: TimeCertainty;
  readonly place: { readonly label: string; readonly latitude: number; readonly longitude: number };
  readonly timeZone: string;
  /** Where the date (and time) come from. */
  readonly source: string;
  readonly note?: string;
}

const MUMBAI = { label: 'Mumbai, Maharashtra, India', latitude: 18.9388, longitude: 72.8354 } as const;

/**
 * Built-in records. Dates are as published; times only where a time is
 * given, and the one research time (NIFTY's launch at 10:00) is marked
 * provisional, as the brief asks.
 */
export const CHART_RECORDS: readonly ChartRecord[] = [
  {
    id: 'nifty50-launch-provisional', instrumentId: 'nifty50', kind: 'index-launch', date: '1996-04-22', time: '10:00',
    timeCertainty: 'provisional', place: MUMBAI, timeZone: 'Asia/Kolkata',
    source:
      'Launch date: NSE Indices (index launched 22 April 1996). No launch time is published: NSE Indices, Wikipedia and the press ' +
      'were searched on 2026-11-24 without finding one. Time 10:00 is a research convention, not a documented launch time.',
  },
  {
    id: 'nifty50-base', instrumentId: 'nifty50', kind: 'index-base-date', date: '1995-11-03', timeCertainty: 'date-only',
    place: MUMBAI, timeZone: 'Asia/Kolkata',
    source: 'NSE Indices methodology: base period the close of 3 November 1995, base value 1000.',
    note: 'A base date is the close of a day, not an event at an instant.',
  },
  {
    id: 'sensex-launch', instrumentId: 'sensex', kind: 'index-launch', date: '1986-01-01', timeCertainty: 'date-only',
    place: MUMBAI, timeZone: 'Asia/Kolkata',
    source: 'BSE: SENSEX first compiled and published 1 January 1986 (base year 1978–79 = 100).',
  },
  {
    id: 'reliance-incorporation', instrumentId: 'reliance', kind: 'incorporation', date: '1973-05-08', timeCertainty: 'date-only',
    place: { label: 'Bengaluru, Karnataka, India', latitude: 12.9716, longitude: 77.5946 }, timeZone: 'Asia/Kolkata',
    source:
      'Incorporated as Mynylon Limited, registered in Karnataka, on 8 May 1973 (company history). The company’s Annual Report 1976-77 ' +
      '(ril.com archive, Notes on accounts, note 1) confirms the Mynylon name, its change to Reliance Textile Industries Limited and the ' +
      'Karnataka registration; it does not restate the date.',
    note: 'Some secondary sources date an earlier Reliance entity to 1966; this record is the 1973 incorporation only.',
  },
  {
    id: 'reliance-listing', instrumentId: 'reliance', kind: 'listing', date: '1978-01-23', timeCertainty: 'date-only',
    place: MUMBAI, timeZone: 'Asia/Kolkata',
    source:
      'Reliance Textile Industries Limited, Annual Report 1976-77, Directors’ Report, p. 6 (ril.com archive): the shares were ' +
      '"listed on the Stock Exchanges at Bombay and Ahmedabad with effect from 23rd January, 1978". The Offer for Sale of 28,20,000 ' +
      'equity shares is dated 24 October 1977 (Annual Report 1977-78).',
    note: 'Listing took effect on that date; the report gives no time and no first-trade price. Bombay is the exchange of record here.',
  },
];

/**
 * Chart records still owed. Empty since 0.43: the Reliance listing date was
 * found in the company's own annual report. A user who has another record (a
 * first-trade time, say) adds it as a record of their own.
 */
export const MISSING_RECORDS: readonly { readonly instrumentId: string; readonly kind: ChartKind; readonly needed: string }[] = [];

/** The records of one instrument, built-in and the user's own. */
export function chartRecordsFor(instrumentId: string, own: readonly ChartRecord[] = []): ChartRecord[] {
  return [...CHART_RECORDS, ...own].filter((r) => r.instrumentId === instrumentId);
}

export type RecordProblem = 'BAD_DATE' | 'BAD_TIME' | 'TIME_WITHOUT_CERTAINTY' | 'CERTAINTY_WITHOUT_TIME' | 'NO_SOURCE' | 'BAD_PLACE';

/** Problems with a user-entered record; empty when it can be used. */
export function validateRecord(r: ChartRecord): RecordProblem[] {
  const out: RecordProblem[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(`${r.date}T00:00:00Z`))) out.push('BAD_DATE');
  if (r.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) out.push('BAD_TIME');
  if (r.time !== undefined && r.timeCertainty === 'date-only') out.push('TIME_WITHOUT_CERTAINTY');
  if (r.time === undefined && r.timeCertainty !== 'date-only') out.push('CERTAINTY_WITHOUT_TIME');
  if (!r.source.trim()) out.push('NO_SOURCE');
  if (!(Math.abs(r.place.latitude) <= 90 && Math.abs(r.place.longitude) <= 180)) out.push('BAD_PLACE');
  return out;
}
